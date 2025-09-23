// worker.js - Xử lý tệp Excel trên một luồng riêng biệt để không làm treo giao diện

// Tải thư viện XLSX vào worker
importScripts('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');

// --- Các hàm tiện ích được sao chép để worker có thể tự hoạt động ---
function getRowValue(row, keys) {
    for (const key of keys) {
        if (row[key] !== undefined && row[key] !== null) return row[key];
    }
    return undefined;
}

function parseExcelDate(excelDate) {
    if (excelDate instanceof Date && !isNaN(excelDate)) return excelDate;
    if (typeof excelDate === 'number') {
        // Excel stores dates as number of days since 1900-01-01
        return new Date(Math.round((excelDate - 25569) * 86400 * 1000));
    }
    if (typeof excelDate === 'string') {
        const date = new Date(excelDate);
        if (!isNaN(date)) return date;
    }
    return null;
}

// Lắng nghe tin nhắn từ luồng chính
self.onmessage = function(e) {
    const { fileBuffer, COL } = e.data;

    try {
        postMessage({ type: 'status', message: 'Đang phân tích cấu trúc file Excel...' });
        const workbook = XLSX.read(fileBuffer, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

        if (jsonData.length === 0) throw new Error("File Excel không có dữ liệu.");

        postMessage({ type: 'status', message: 'Đã đọc file. Loại bỏ dữ liệu trùng lặp...' });
        const uniqueRecords = new Set();
        const deduplicatedData = [];
        jsonData.forEach(row => {
            const uniqueKey = `${getRowValue(row, COL.ID) || ''}-${getRowValue(row, COL.PRODUCT) || ''}-${getRowValue(row, COL.PRICE) || 0}`;
            if (!uniqueRecords.has(uniqueKey)) {
                uniqueRecords.add(uniqueKey);
                deduplicatedData.push(row);
            }
        });

        postMessage({ type: 'status', message: 'Đang chuẩn hóa dữ liệu ngày tháng...' });
        const originalData = deduplicatedData
            .map(row => ({ ...row, parsedDate: parseExcelDate(getRowValue(row, COL.DATE_CREATED)) }))
            .filter(row => row.parsedDate && !isNaN(row.parsedDate));

        if (originalData.length === 0) throw new Error("Không tìm thấy dữ liệu ngày hợp lệ. Vui lòng định dạng cột 'Ngày tạo' thành kiểu Date trong Excel.");

        // Gửi dữ liệu đã xử lý về luồng chính
        postMessage({ type: 'done', payload: originalData });

    } catch (error) {
        postMessage({ type: 'error', message: error.message });
    }
};