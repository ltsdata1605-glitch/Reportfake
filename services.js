// --- Core Logic & Data Processing ---

async function loadConfigFromSheet() {
    const url = googleSheetUrlInput.value.trim();
    if (!url) throw new Error("Vui lòng nhập URL của Google Sheet cấu hình.");

    showMessage('Đang tải file cấu hình...');
    progressBar.style.width = '25%';

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Không thể tải file cấu hình. Mã lỗi: ${response.status}`);

        const csvText = await response.text();
        // Reset configs
        App.state.productConfig = { groups: {}, subgroups: {}, childToParentMap: {}, childToSubgroupMap: {} };

        const rows = csvText.split(/\r?\n/).slice(1);
        rows.forEach(row => {
            const columns = row.split(',');
            if (columns.length < 4) return;
            const [, maNhomHang, nhomHangCha, nhomHangCon] = columns.map(c => c.trim());
            if (!maNhomHang || !nhomHangCha || !nhomHangCon) return;

            if (!App.state.productConfig.groups[nhomHangCha]) App.state.productConfig.groups[nhomHangCha] = new Set();
            App.state.productConfig.groups[nhomHangCha].add(maNhomHang);

            if (!App.state.productConfig.subgroups[nhomHangCha]) App.state.productConfig.subgroups[nhomHangCha] = {};
            if (!App.state.productConfig.subgroups[nhomHangCha][nhomHangCon]) App.state.productConfig.subgroups[nhomHangCha][nhomHangCon] = [];
            App.state.productConfig.subgroups[nhomHangCha][nhomHangCon].push(maNhomHang);

            App.state.productConfig.childToParentMap[maNhomHang] = nhomHangCha;
            App.state.productConfig.childToSubgroupMap[maNhomHang] = nhomHangCon;
        });

        if (Object.keys(App.state.productConfig.groups).length === 0) {
            throw new Error("File cấu hình không có dữ liệu hoặc sai định dạng. Vui lòng kiểm tra lại file Google Sheet.");
        }

        showMessage('Tải cấu hình thành công!', 'success');
        progressBar.style.width = '50%';
        return true;
    } catch (error) {
        throw new Error(`Lỗi tải cấu hình: ${error.message}`);
    }
}

async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    dashboardWrapper.style.display = 'none';
    uploadContainer.style.display = 'none';
    newFileBtn.classList.add('hidden');
    statusContainer.classList.remove('hidden');
    progressBar.style.width = '0%';

    try {
        await loadConfigFromSheet();

        showMessage(`Đang đọc file "${file.name}"...`);
        const data = await readFileAsArrayBuffer(file);

        showMessage('Đọc file thành công. Bắt đầu xử lý dữ liệu...');

        setTimeout(() => { // Use setTimeout to allow UI to update
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            let jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

            if (jsonData.length === 0) throw new Error("File Excel không có dữ liệu.");

            showMessage('Đã đọc file. Loại bỏ dữ liệu trùng lặp...');
            const uniqueRecords = new Set();
            const deduplicatedData = [];

            jsonData.forEach(row => {
                const uniqueKey = `${getRowValue(row, COL.ID) || ''}-${getRowValue(row, COL.PRODUCT) || ''}-${getRowValue(row, COL.PRICE) || 0}`;
                if (!uniqueRecords.has(uniqueKey)) {
                    uniqueRecords.add(uniqueKey);
                    deduplicatedData.push(row);
                }
            });

            App.state.originalData = deduplicatedData
                .map(row => ({...row, parsedDate: parseExcelDate(getRowValue(row, COL.DATE_CREATED))}))
                .filter(row => row.parsedDate && !isNaN(row.parsedDate));

            if (App.state.originalData.length === 0) throw new Error("Không tìm thấy dữ liệu ngày hợp lệ. Vui lòng định dạng cột 'Ngày tạo' thành kiểu Date trong Excel.");

            initializeDashboard();

            showMessage(`Phân tích thành công ${App.state.originalData.length} dòng dữ liệu.`, 'success');
            progressBar.style.width = '100%';

            dashboardWrapper.style.display = 'block';
            newFileBtn.classList.remove('hidden');

            setTimeout(() => {
                dashboardWrapper.classList.add('loaded');
                statusContainer.classList.add('hidden');
            }, 100);

        }, 200);

    } catch (error) {
        showMessage(`${error.message}`, 'error');
        fileUploadInput.value = ''; // Reset file input
        uploadContainer.style.display = 'block'; // Show upload screen again
    }
}

function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onprogress = e => {
            if (e.lengthComputable) {
                const percent = 50 + Math.round((e.loaded / e.total) * 50);
                progressBar.style.width = `${percent}%`;
            }
        };
        reader.onerror = () => reject(new Error('Đã xảy ra lỗi khi đọc file.'));
        reader.onload = (event) => resolve(event.target.result);
        reader.readAsArrayBuffer(file);
    });
}

function calculateTrendData(data) {
    const daily = {};
    const shifts = {
        "Ca 1": { revenue: 0, revenueQD: 0 }, "Ca 2": { revenue: 0, revenueQD: 0 },
        "Ca 3": { revenue: 0, revenueQD: 0 }, "Ca 4": { revenue: 0, revenueQD: 0 },
        "Ca 5": { revenue: 0, revenueQD: 0 }, "Ca 6": { revenue: 0, revenueQD: 0 }
    };
    const hinhThucXuatTienMat = new Set(['Xuất bán hàng Online tại siêu thị', 'Xuất bán hàng online tiết kiệm', 'Xuất bán hàng tại siêu thị', 'Xuất bán hàng tại siêu thị (TCĐM)', 'Xuất bán Online giá rẻ', 'Xuất bán pre-order tại siêu thị', 'Xuất bán ưu đãi cho nhân viên', 'Xuất dịch vụ thu hộ bảo hiểm', 'Xuất đổi bảo hành sản phẩm IMEI', 'Xuất đổi bảo hành tại siêu thị']);
    const hinhThucXuatTraGop = new Set(['Xuất bán hàng trả góp Online', 'Xuất bán hàng trả góp Online giá rẻ', 'Xuất bán hàng trả góp online tiết kiệm', 'Xuất bán hàng trả góp tại siêu thị', 'Xuất bán hàng trả góp tại siêu thị (TCĐM)', 'Xuất bán trả góp ưu đãi cho nhân viên', 'Xuất đổi bảo hành sản phẩm trả góp có IMEI', 'Xuất bán trả góp cho NV phục vụ công việc']);

    data.forEach(row => {
        const hinhThucXuat = getRowValue(row, COL.HINH_THUC_XUAT);
        if (hinhThucXuatTienMat.has(hinhThucXuat) || hinhThucXuatTraGop.has(hinhThucXuat)) {
            const price = Number(getRowValue(row, COL.PRICE)) || 0;
            const heSoQuyDoi = getHeSoQuyDoi(getRowValue(row, COL.MA_NGANH_HANG), getRowValue(row, COL.MA_NHOM_HANG));
            const revenueQD = price * heSoQuyDoi;
            const date = row.parsedDate;
            if (!date) return;

            const dateStr = toLocalISOString(date);
            if (!daily[dateStr]) daily[dateStr] = { revenue: 0, revenueQD: 0, date: date };
            daily[dateStr].revenue += price;
            daily[dateStr].revenueQD += revenueQD;

            const hour = date.getHours();
            let ca;
            if (hour < 9) ca = "Ca 1";
            else if (hour < 12) ca = "Ca 2";
            else if (hour < 15) ca = "Ca 3";
            else if (hour < 18) ca = "Ca 4";
            else if (hour < 21) ca = "Ca 5";
            else ca = "Ca 6";
            shifts[ca].revenue += price;
            shifts[ca].revenueQD += revenueQD;
        }
    });

    return { daily, shifts };
}

function processAndDrawDashboard(data) {
    const hinhThucXuatThuHo = new Set(['Xuất dịch vụ thu hộ trả góp ACS', 'Xuất dịch vụ thu hộ cước Payoo', 'Xuất dịch vụ thu hộ qua Epay', 'Xuất dịch vụ thu hộ qua SmartNet', 'Xuất dịch vụ thu hộ qua tổng công ty Viettel', 'Xuất dịch vụ thu hộ nạp tiền vào ví', 'Xuất dịch vụ thu hộ cước Bảo Kim']);
    const hinhThucXuatTienMat = new Set(['Xuất bán hàng Online tại siêu thị', 'Xuất bán hàng online tiết kiệm', 'Xuất bán hàng tại siêu thị', 'Xuất bán hàng tại siêu thị (TCĐM)', 'Xuất bán Online giá rẻ', 'Xuất bán pre-order tại siêu thị', 'Xuất bán ưu đãi cho nhân viên', 'Xuất dịch vụ thu hộ bảo hiểm', 'Xuất đổi bảo hành sản phẩm IMEI', 'Xuất đổi bảo hành tại siêu thị']);
    const hinhThucXuatTraGop = new Set(['Xuất bán hàng trả góp Online', 'Xuất bán hàng trả góp Online giá rẻ', 'Xuất bán hàng trả góp online tiết kiệm', 'Xuất bán hàng trả góp tại siêu thị', 'Xuất bán hàng trả góp tại siêu thị (TCĐM)', 'Xuất bán trả góp ưu đãi cho nhân viên', 'Xuất đổi bảo hành sản phẩm trả góp có IMEI', 'Xuất bán trả góp cho NV phục vụ công việc']);

    App.state.validSalesData = data.filter(row => {
        const getString = (k) => (getRowValue(row, k) || '').toString().trim().toLowerCase();
        const isNotThuHo = !hinhThucXuatThuHo.has(getRowValue(row, COL.HINH_THUC_XUAT) || '');
        const baseConditionsMet = getString(COL.TRANG_THAI_HUY) === 'chưa hủy' &&
                                  getString(COL.TINH_TRANG_NHAP_TRA) === 'chưa trả' &&
                                  getString(COL.TRANG_THAI_THU_TIEN) === 'đã thu';
        return isNotThuHo && baseConditionsMet;
    });

    let totalRevenue = 0, totalDoanhThuQD = 0, totalTraGop = 0, doanhThuThucChoXuat = 0, totalTraChamCount = 0;

    const slThuHoBySeller = {};
    const allSellersInScope = [...new Set(data.map(r => getRowValue(r, COL.NGUOI_TAO)).filter(Boolean))];
    allSellersInScope.forEach(s => slThuHoBySeller[s] = 0);

    let soLuongThuHo = 0;
    data.forEach(row => {
        if (hinhThucXuatThuHo.has(getRowValue(row, COL.HINH_THUC_XUAT))) {
            soLuongThuHo++;
            const seller = getRowValue(row, COL.NGUOI_TAO);
            if (seller && slThuHoBySeller.hasOwnProperty(seller)) {
                slThuHoBySeller[seller]++;
            }
        }
    });

    const sellerData = {};
    const customerSetsBySeller = {};
    const slTraChamBySeller = {};
    const revenueByMainGroup = {};
    const quantityByMainGroup = {};

    App.state.validSalesData.forEach(row => {
        const price = Number(getRowValue(row, COL.PRICE)) || 0;
        const quantity = Number(getRowValue(row, COL.QUANTITY)) || 0;
        const heSoQuyDoi = getHeSoQuyDoi(getRowValue(row, COL.MA_NGANH_HANG), getRowValue(row, COL.MA_NHOM_HANG));
        const doanhThuQDRow = price * heSoQuyDoi;
        totalDoanhThuQD += doanhThuQDRow;

        const hinhThucXuat = getRowValue(row, COL.HINH_THUC_XUAT);
        const isTraGop = hinhThucXuatTraGop.has(hinhThucXuat);
        if (hinhThucXuatTienMat.has(hinhThucXuat) || isTraGop) {
            totalRevenue += price;
        }
        if (isTraGop) {
            totalTraGop += price;
            totalTraChamCount++;
        }

        const maNhomHang = getRowValue(row, COL.MA_NHOM_HANG);
        let mainGroup = App.state.productConfig.childToParentMap[maNhomHang];
        const childGroup = App.state.productConfig.childToSubgroupMap[maNhomHang];

        // Define subgroups that should be treated as their own main group
        const groupsToExtract = new Set([
            'Smartphone', 'Laptop', 'Tablet', 'IT', 'Office & Virus', // From ICT
            'Máy lọc nước', // From Gia dụng
            'Máy lạnh', 'Máy nước nóng', 'Tủ lạnh', 'Tủ đông',
            'Tủ mát', 'Máy giặt', 'Máy sấy', 'Máy rửa chén' // From CE
        ]);

        if (groupsToExtract.has(childGroup)) {
            mainGroup = childGroup; // Promote the subgroup to a main group
        }

        if (mainGroup) {
           if (!revenueByMainGroup[mainGroup]) revenueByMainGroup[mainGroup] = 0;
           if (!quantityByMainGroup[mainGroup]) quantityByMainGroup[mainGroup] = 0;
           revenueByMainGroup[mainGroup] += price;
           quantityByMainGroup[mainGroup] += quantity;
        }

        const seller = getRowValue(row, COL.NGUOI_TAO);
        const customer = getRowValue(row, COL.CUSTOMER_NAME);
        if (seller) {
            if (!sellerData[seller]) {
                sellerData[seller] = { doanhThuThuc: 0, doanhThuQD: 0, orderCount: 0, traGopRevenue: 0 };
                customerSetsBySeller[seller] = new Set();
                slTraChamBySeller[seller] = 0;
            }
            sellerData[seller].doanhThuThuc += price;
            sellerData[seller].doanhThuQD += doanhThuQDRow;
            sellerData[seller].orderCount += quantity;
            if(customer) customerSetsBySeller[seller].add(customer);
            if(isTraGop) {
                sellerData[seller].traGopRevenue += price;
                slTraChamBySeller[seller]++;
            }
        }
    });

    const unshippedRevenueData = App.state.filteredData.filter(row => {
         const getString = (k) => (getRowValue(row, k) || '').toString().trim().toLowerCase();
         return getRowValue(row, COL.XUAT) === 'Chưa xuất' &&
             getString(COL.TRANG_THAI_HUY) === 'chưa hủy' &&
             getString(COL.TINH_TRANG_NHAP_TRA) === 'chưa trả';
    });
    doanhThuThucChoXuat = unshippedRevenueData.reduce((sum, row) => sum + (Number(getRowValue(row, COL.PRICE)) || 0), 0);

    App.state.trendState.data = calculateTrendData(App.state.validSalesData);

    const allSellerNames = [...new Set([...Object.keys(sellerData), ...Object.keys(slThuHoBySeller)])];
    App.state.fullSellerArray = allSellerNames.map(s => {
        const d = sellerData[s] || { doanhThuThuc: 0, doanhThuQD: 0, orderCount: 0, traGopRevenue: 0 };
        const slTiepCan = customerSetsBySeller[s]?.size || 0;
        return {
            name: s,
            doanhThuThuc: d.doanhThuThuc,
            doanhThuQD: d.doanhThuQD,
            hieuQuaValue: d.doanhThuThuc > 0 ? ((d.doanhThuQD - d.doanhThuThuc) / d.doanhThuThuc) * 100 : 0,
            slTiepCan: slTiepCan,
            aov: slTiepCan > 0 ? d.doanhThuThuc / slTiepCan : 0,
            traGopPercent: d.doanhThuThuc > 0 ? (d.traGopRevenue / d.doanhThuThuc) * 100 : 0,
            slThuHo: slThuHoBySeller[s] || 0,
            slTraCham: slTraChamBySeller[s] || 0
        };
    });

    const groupsToExclude = ['DCNB', 'Thẻ cào', 'Phụ kiện lắp đặt', 'Software'];
    const sortedGroupsForChart = Object.entries(revenueByMainGroup)
        .filter(([groupName, revenue]) => revenue > 0 && !groupsToExclude.includes(groupName))
        .sort(([, a], [, b]) => b - a)
        .map(([groupName, revenue]) => [groupName, revenue, quantityByMainGroup[groupName] || 0]);

    // Update UI
    updateKPIs({ totalDoanhThuQD, totalRevenue, soLuongThuHo, doanhThuThucChoXuat, totalTraGop, totalTraChamCount });
    drawTrendChart();
    drawIndustryGrid(sortedGroupsForChart);
    drawTopSellerTable();
    drawEmployeePerformanceTable();
    renderSummaryTable(App.state.validSalesData);
    document.getElementById('loading-overlay').classList.add('hidden');
    lucide.createIcons();
}

Date.prototype.getWeek = function() {
    const date = new Date(Date.UTC(this.getFullYear(), this.getMonth(), this.getDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay()||7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
    return Math.ceil((((date - yearStart) / 86400000) + 1)/7);
}

function getWeekStartDate(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

function aggregateDataByWeek(dailyData, metricKey) {
    const weeklyTotals = {};
    const sortedDates = Object.keys(dailyData).sort();
    sortedDates.forEach(dateStr => {
        const date = dailyData[dateStr].date;
        const year = date.getFullYear();
        const week = date.getWeek();
        const key = `${year}-W${week.toString().padStart(2, '0')}`;
        if (!weeklyTotals[key]) {
            const weekStart = getWeekStartDate(date);
            weeklyTotals[key] = { value: 0, start: weekStart };
        }
        weeklyTotals[key].value += dailyData[dateStr][metricKey];
    });
    const sortedWeeks = Object.keys(weeklyTotals).sort();
    let lastValue = 0;
    return sortedWeeks.map((key) => {
        const weekData = weeklyTotals[key];
        const value = weekData.value;
        const change = lastValue > 0 ? (value - lastValue) / lastValue : null;
        lastValue = value;
        const label = `Tuần ${weekData.start.getWeek()}`;
        return { label, value, change };
    });
}

function aggregateDataByMonth(dailyData, metricKey) {
    const monthlyTotals = {};
    const sortedDates = Object.keys(dailyData).sort();
    sortedDates.forEach(dateStr => {
        const date = dailyData[dateStr].date;
        const key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        if (!monthlyTotals[key]) monthlyTotals[key] = 0;
        monthlyTotals[key] += dailyData[dateStr][metricKey];
    });
    const sortedMonths = Object.keys(monthlyTotals).sort();
    let lastValue = 0;
    return sortedMonths.map(key => {
        const value = monthlyTotals[key];
        const change = lastValue > 0 ? (value - lastValue) / lastValue : null;
        lastValue = value;
        const [year, month] = key.split('-');
        return { label: `Thg ${month}/${year.slice(2)}`, value, change };
    });
}