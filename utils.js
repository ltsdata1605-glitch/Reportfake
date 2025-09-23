// --- Utility Functions --- 
function getRowValue(row, keys) { 
    for (const key of keys) if (row[key] !== undefined && row[key] !== null) return row[key]; 
    return undefined; 
} 

function toLocalISOString(date) { 
    if (!date) return ''; 
    const year = date.getFullYear(); 
    const month = (date.getMonth() + 1).toString().padStart(2, '0'); 
    const day = date.getDate().toString().padStart(2, '0'); 
    return `${year}-${month}-${day}`; 
} 

function parseExcelDate(excelDate) {
    if (excelDate instanceof Date && !isNaN(excelDate)) return excelDate;
    if (typeof excelDate === 'number') {
        return new Date(Math.round((excelDate - 25569) * 86400 * 1000));
    }
    if (typeof excelDate === 'string') {
        const date = new Date(excelDate);
        if (!isNaN(date)) return date;
    }
    return null;
}

function abbreviateName(fullName) { 
    if (!fullName || !fullName.includes(' - ')) return fullName; 
    const parts = fullName.split(' - '); 
    const id = parts[0]; 
    const name = parts[1]; 
    const nameWords = name.trim().split(' '); 
    if (nameWords.length <= 1) return fullName; 
    const lastName = nameWords[nameWords.length - 1]; 
    const middleNameInitial = nameWords.length > 2 ? nameWords[nameWords.length - 2].charAt(0).toUpperCase() : nameWords[0].charAt(0).toUpperCase(); 
    return `${id} - ${middleNameInitial}.${lastName}`; 
} 

function formatCurrency(number, precision = 0) { 
    if (isNaN(number) || number === 0) return '0'; 
    if (Math.abs(number) >= 1000000000) return `${(number / 1000000000).toFixed(1).replace(/\.0$/, '')} Tỷ`; 
    if (Math.abs(number) >= 1000000) return `${(number / 1000000).toFixed(precision).replace(/\.0$/, '')} Tr`; 
    if (Math.abs(number) >= 1000) return `${Math.round(number / 1000)} K`; 
    return number.toLocaleString('vi-VN'); 
} 

function getHeSoQuyDoi(maNganhHang, maNhomHang) { 
    if (maNganhHang === '164 - VAS' && (maNhomHang === '4479 - Dịch Vụ Bảo Hiểm' || maNhomHang === '4499 - Thu Hộ Phí Bảo Hiểm')) return 4.18; 
    if (maNganhHang === '304 - Điện tử' && maNhomHang === '880 - Loa Karaoke') return 1.29; 
    switch (maNganhHang) { 
        case '664 - Sim Online': return 5.45; 
        case '16 - Phụ kiện tiện ích': case '184 - Phụ kiện trang trí': case '764 - Loa vi tính': return 3.37; 
        case '23 - Wearable': case '1274 - Đồng Hồ Thời Trang': return 3; 
        case '364 - IT': return 2; 
        case '1034 - Dụng cụ nhà bếp': return 1.92; 
        case '1116 - Máy lọc nước': case '484 - Điện gia dụng': case '1214 - Gia dụng lắp đặt': return 1.85; 
        case '22 - Laptop': case '244 - Tablet': return 1.2; 
        default: return 1; 
    } 
} 