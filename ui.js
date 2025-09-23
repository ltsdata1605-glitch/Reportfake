// --- UI & Drawing Functions ---

function showMessage(message, type = 'info') {
    statusMessage.textContent = message;
    statusIcon.classList.remove('text-green-600', 'text-red-600', 'text-indigo-500', 'animate-spin');

    switch(type) {
        case 'success':
            statusIcon.setAttribute('data-lucide', 'check-circle');
            statusIcon.classList.add('text-green-600');
            break;
        case 'error':
            statusIcon.setAttribute('data-lucide', 'alert-circle');
            statusIcon.classList.add('text-red-600');
            break;
        default:
            statusIcon.setAttribute('data-lucide', 'loader-2');
            statusIcon.classList.add('text-indigo-500', 'animate-spin');
    }
    lucide.createIcons();
}

function updateKPIs({ totalDoanhThuQD, totalRevenue, soLuongThuHo, doanhThuThucChoXuat, totalTraGop, totalTraChamCount }) {
    const hieuQuaQDFinal = totalRevenue > 0 ? (totalDoanhThuQD - totalRevenue) / totalRevenue : 0;
    const traGopPercentage = totalRevenue > 0 ? (totalTraGop / totalRevenue) * 100 : 0;

    document.getElementById('doanh-thu-qd-combined').textContent = formatCurrency(totalDoanhThuQD, 0);
    document.getElementById('total-revenue-combined').textContent = `Thực: ${formatCurrency(totalRevenue, 0)}`;
    document.getElementById('so-luong-thu-ho-combined').textContent = `T.Hộ: ${soLuongThuHo.toLocaleString('vi-VN')}`;

    document.getElementById('doanh-thu-thuc-cho-xuat').textContent = formatCurrency(doanhThuThucChoXuat, 0);
    document.getElementById('last-updated').textContent = `Cập nhật lần cuối: ${new Date().toLocaleString('vi-VN')}`;
    document.getElementById('da-thu-value').textContent = `ĐH đã thu: ${formatCurrency(totalRevenue)}`;

    const hieuQuaEl = document.getElementById('hieu-qua-qd');
    const hieuQuaValue = hieuQuaQDFinal * 100;
    hieuQuaEl.textContent = `${hieuQuaValue.toFixed(0)}%`;
    hieuQuaEl.classList.remove('text-red-500', 'text-green-500', 'text-purple-600', 'dark:text-purple-400');
    if (hieuQuaValue < 40) {
        hieuQuaEl.classList.add('text-red-500');
    } else {
        hieuQuaEl.classList.add('text-green-500');
    }

    const traGopPercentEl = document.getElementById('tra-gop-percent');
    const traGopValueEl = document.getElementById('tra-gop-value');
    const traGopCountEl = document.getElementById('tra-gop-count');
    traGopPercentEl.textContent = `${traGopPercentage.toFixed(0)}%`;
    traGopValueEl.textContent = `DT: ${formatCurrency(totalTraGop, 0)}`;
    if(traGopCountEl) traGopCountEl.textContent = `SL: ${totalTraChamCount.toLocaleString('vi-VN')}`;
    traGopPercentEl.classList.toggle('text-red-500', traGopPercentage < 45);
    traGopPercentEl.classList.toggle('text-yellow-500', traGopPercentage >= 45);
}

function updateDynamicReportTitle() {
    const titleEl = document.querySelector('#report-title-container h2');
    const subTitleEl = document.querySelector('#report-title-container p');

    let filters = [];
    const selectedKho = document.querySelector('#filter-kho-container .active')?.dataset.value;
    if(selectedKho && selectedKho !== 'all') filters.push(`Kho: ${selectedKho}`);

    const selectedXuat = document.querySelector('#filter-xuat-container .active')?.dataset.value;
    if(selectedXuat && selectedXuat !== 'all') filters.push(`Xuất: ${selectedXuat}`);

    const selectedTrangThai = getSelectedCheckboxes('trang-thai');
    if (selectedTrangThai.length > 0 && selectedTrangThai.length < [...new Set(App.state.originalData.map(r => getRowValue(r, COL.TRANG_THAI)).filter(Boolean))].length) {
        filters.push(`Trạng thái SP: ${selectedTrangThai.length} đã chọn`);
    }

    const selectedNguoiTao = getSelectedCheckboxes('nguoi-tao');
    if (selectedNguoiTao.length > 0 && selectedNguoiTao.length < [...new Set(App.state.originalData.map(r => getRowValue(r, COL.NGUOI_TAO)).filter(Boolean))].length) {
        filters.push(`Người tạo: ${selectedNguoiTao.length} đã chọn`);
    }

    titleEl.textContent = "Tổng Quan Kết Quả Kinh Doanh";
    subTitleEl.textContent = filters.length > 0 ? `Lọc theo: ${filters.join(' | ')}` : "Dữ liệu được cập nhật dựa trên các bộ lọc đã chọn.";
}

function updateTrendChartSubtitle() {
    const subtitleEl = document.getElementById('trend-chart-subtitle');
    if (!subtitleEl) return;

    const dateRangeButton = document.querySelector('#date-filter-container button.active');
    const dateRangeText = dateRangeButton ? dateRangeButton.textContent.trim() : 'Tất cả';

    const viewButton = document.querySelector('#trend-view-controls button.active');
    const viewText = viewButton ? viewButton.textContent.trim() : 'Ca';

    subtitleEl.textContent = `Tiêu chí: ${dateRangeText} | Xem theo: ${viewText}`;
}

function drawTrendChart() {
    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#f1f5f9' : '#0f172a';
    const gridColor = isDark ? '#334152' : '#e2e8f0';
    const bgColor = 'transparent'; // Use transparent for better image export

    const container = document.getElementById('trend_chart_div');
    const titleEl = document.getElementById('trend-chart-title');

    const metricKey = App.state.trendState.metric === 'qd' ? 'revenueQD' : 'revenue';
    const metricName = App.state.trendState.metric === 'qd' ? 'DTQĐ' : 'Thực';

    let dataArray, options, chart;
    let totalValue = 0;

    switch (App.state.trendState.view) {
        case 'daily': {
            const dailyData = App.state.trendState.data.daily || {};
            const sortedDates = Object.keys(dailyData).sort();
            if (sortedDates.length === 0) { container.innerHTML = '<p class="text-center text-slate-500 dark:text-slate-400">Không có dữ liệu.</p>'; return; }
            dataArray = [['Ngày', metricName, { role: 'annotation' }]];
            sortedDates.forEach(dateStr => {
                const [year, month, day] = dateStr.split('-').map(Number);
                const value = dailyData[dateStr][metricKey];
                totalValue += value;
                dataArray.push([new Date(year, month - 1, day), value, formatCurrency(value)]);
            });
            options = { backgroundColor: bgColor, curveType: 'function', legend: { position: 'none' }, chartArea: { width: '90%', height: '75%' }, hAxis: { textStyle: {color: textColor}, format: 'dd/MM', gridlines: { color: 'transparent' } }, vAxis: { textStyle: {color: textColor}, format: 'short', gridlines: { color: gridColor } }, colors: ['#818cf8'], series: { 0: { areaOpacity: 0.1 } }, annotations: { textStyle: { fontSize: 10, color: textColor }, alwaysOutside: true } };
            chart = new google.visualization.LineChart(container);
            break;
        }
        case 'weekly':
        case 'monthly': {
            const dailyDataForAggregation = App.state.trendState.data.daily || {};
            const aggregateFn = App.state.trendState.view === 'weekly' ? aggregateDataByWeek : aggregateDataByMonth;
            const aggregatedData = aggregateFn(dailyDataForAggregation, metricKey);
            if (aggregatedData.length < 1) { container.innerHTML = '<p class="text-center text-slate-500 dark:text-slate-400">Không có dữ liệu.</p>'; return; }
            dataArray = [[App.state.trendState.view === 'weekly' ? 'Tuần' : 'Tháng', metricName, { role: 'annotation' }, { role: 'style' }]];
            aggregatedData.forEach(item => {
                totalValue += item.value;
                const changeText = item.change !== null ? ` ${item.change >= 0 ? '▲' : '▼'} ${Math.abs(item.change * 100).toFixed(0)}%` : '';
                const annotation = `${formatCurrency(item.value)}${changeText}`;
                const color = item.change !== null ? (item.change >= 0 ? '#22c55e' : '#ef4444') : (isDark ? '#818cf8' : '#4f46e5');
                dataArray.push([item.label, item.value, annotation, color]);
            });
            options = { backgroundColor: bgColor, legend: { position: 'none' }, chartArea: { width: '90%', height: '75%' }, hAxis: { textStyle: {color: textColor}, gridlines: { color: 'transparent' } }, vAxis: { textStyle: {color: textColor}, format: 'short', gridlines: { color: gridColor } }, annotations: { textStyle: { fontSize: 11, bold: true, color: textColor }, alwaysOutside: true }, bar: { groupWidth: '60%' } };
            chart = new google.visualization.ColumnChart(container);
            break;
        }
        case 'shift': {
            const shiftData = App.state.trendState.data.shifts || {};
            const hasShiftData = Object.values(shiftData).some(val => val[metricKey] > 0);
            if (!hasShiftData) { container.innerHTML = '<p class="text-center text-slate-500 dark:text-slate-400">Không có dữ liệu.</p>'; return; }
            dataArray = [['Ca', metricName, { role: 'annotation' }]];
            for (let i = 1; i <= 6; i++) {
                const value = shiftData[`Ca ${i}`][metricKey] || 0;
                totalValue += value;
                dataArray.push([`Ca ${i}`, value, formatCurrency(value)]);
            }
            options = { backgroundColor: bgColor, legend: { position: 'none' }, chartArea: { width: '90%', height: '75%' }, hAxis: { textStyle: {color: textColor}, gridlines: { color: 'transparent' } }, vAxis: { textStyle: {color: textColor}, format: 'short', gridlines: { color: gridColor } }, annotations: { textStyle: { fontSize: 11, bold: true, color: textColor }, alwaysOutside: true }, bar: { groupWidth: '60%' }, colors: [isDark ? '#818cf8' : '#4f46e5'] };
            chart = new google.visualization.ColumnChart(container);
            break;
        }
    }

    titleEl.innerHTML = `XU HƯỚNG DOANH THU <span class="text-slate-500 dark:text-slate-400 font-medium text-base ml-2"> - TỔNG: ${formatCurrency(totalValue)}</span>`;
    updateTrendChartSubtitle();

    if (chart) {
        chart.draw(google.visualization.arrayToDataTable(dataArray), options);
    }
}

function drawIndustryGrid(sortedGroups) {
    const container = document.getElementById('industry-grid-container');
    container.innerHTML = '';

    const totalRevenue = sortedGroups.reduce((sum, item) => sum + item[1], 0);

    const industryIcons = {
        'Smartphone': 'smartphone', 'Laptop': 'laptop', 'Tablet': 'tablet',
        'Phụ kiện': 'headphones', 'Gia dụng': 'sofa', 'Wearable': 'watch',
        'CE': 'tv', 'Bảo hiểm': 'shield-check', 'Sim': 'smartphone-nfc', 'Máy lạnh': 'air-vent',
        'Máy nước nóng': 'bath', 'Tủ lạnh': 'fridge', 'Tủ đông': 'fridge', 'Tủ mát': 'fridge',
        'Máy giặt': 'washing-machine', 'Máy sấy': 'wind', 'Máy rửa chén': 'tableware',
        'Máy lọc nước': 'droplets', 'Vieon': 'film', 'IT': 'printer', 'Office & Virus': 'file-key-2'
    };

    if (sortedGroups.length === 0) {
        container.innerHTML = `<p class="text-slate-500 dark:text-slate-400 text-center col-span-full">Không có dữ liệu ngành hàng.</p>`;
        return;
    }

    sortedGroups.forEach(([groupName, revenue, quantity]) => {
        const percentage = totalRevenue > 0 ? (revenue / totalRevenue * 100) : 0;
        const iconName = industryIcons[groupName] || 'package';
        const card = document.createElement('div');
        card.className = 'bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg flex flex-col items-center justify-center text-center cursor-pointer transition-shadow hover:shadow-md';
        card.dataset.groupName = groupName;
        card.innerHTML = `<div class="w-8 h-8 flex items-center justify-center text-indigo-600 dark:text-indigo-400"><i data-lucide="${iconName}" class="w-6 h-6"></i></div>
                                    <p class="font-bold text-slate-700 dark:text-slate-200 text-xs mt-1">${groupName}</p>
                                    <p class="font-semibold text-base text-indigo-600 dark:text-indigo-400">${formatCurrency(revenue, 0)}</p>
                                    <p class="text-xs text-slate-500 dark:text-slate-400">${quantity.toLocaleString('vi-VN')} SP - ${percentage.toFixed(0)}%</p>`;
        card.addEventListener('click', () => showIndustryDetailModal(groupName));
        container.appendChild(card);
    });
    lucide.createIcons();
}

function drawTopSellerTable() {
    const container = document.getElementById('top_seller_table_div');
    container.innerHTML = '';

    const sortedSellers = [...App.state.fullSellerArray].sort((a, b) => b.doanhThuQD - a.doanhThuQD)
    const dataToRender = App.state.showingAllSellers
        ? sortedSellers.filter(s => s.doanhThuThuc > 0)
        : sortedSellers.slice(0, 5);

    if (dataToRender.length === 0) {
        container.innerHTML = `<p class="text-center text-slate-500 dark:text-slate-400 py-8">Không có dữ liệu nhân viên.</p>`;
        return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    dataToRender.forEach((seller, index) => {
        const rankIndex = sortedSellers.findIndex(s => s.name === seller.name);
        const medal = medals[rankIndex] || `<span class="text-slate-500 dark:text-slate-400 font-semibold">#${rankIndex + 1}</span>`;
        const hieuQuaClass = seller.hieuQuaValue < 35 ? 'text-red-500 font-bold' : 'text-green-500 font-bold';
        const card = document.createElement('div');
        card.className = `employee-card p-2 rounded-xl border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 transition-shadow hover:shadow-md cursor-pointer`;
        card.dataset.employeeName = seller.name;
        card.innerHTML = `<div class="flex items-center gap-2">
            <div class="w-8 text-lg font-bold text-center">${medal}</div>
            <div class="flex-grow min-w-0">
                <div><p class="font-bold text-slate-800 dark:text-slate-100 text-sm truncate">${abbreviateName(seller.name)}</p></div>
                <div class="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span><strong class="text-slate-600 dark:text-slate-300">Thực:</strong> ${formatCurrency(seller.doanhThuThuc, 0)}</span>
                    <span class="inline-flex items-center"><strong class="text-slate-600 dark:text-slate-300">HQQĐ:</strong><span class="ml-1 ${hieuQuaClass}">${seller.hieuQuaValue.toFixed(0)}%</span></span>
                    <span><strong class="text-slate-600 dark:text-slate-300">T.Cận:</strong> ${seller.slTiepCan.toLocaleString('vi-VN')}</span>
                    <span><strong class="text-slate-600 dark:text-slate-300">T.Chậm:</strong> ${seller.slTraCham.toLocaleString('vi-VN')}</span>
                    <span><strong class="text-slate-600 dark:text-slate-300">T.Hộ:</strong> ${seller.slThuHo.toLocaleString('vi-VN')}</span>
                </div>
            </div>
            <div class="text-right flex-shrink-0">
                <p class="text-xs text-slate-500 dark:text-slate-400">DTQĐ</p>
                <p class="font-bold text-lg text-indigo-600 dark:text-indigo-400">${formatCurrency(seller.doanhThuQD, 0)}</p>
            </div>
        </div>`;
        card.addEventListener('click', () => showPerformanceModal(seller.name));
        container.appendChild(card);
    });
    lucide.createIcons();
}

function drawEmployeePerformanceTable() {
    const tbody = document.getElementById('perf-summary-tbody');
    const header = document.getElementById('perf-summary-header');
    if (!tbody || !header) return;
    tbody.innerHTML = '';

    header.querySelectorAll('.sortable-header').forEach(th => {
        th.classList.remove('active', 'asc', 'desc');
        const icon = th.querySelector('.sort-icon');
        if (icon) icon.remove();

        if (th.dataset.sortBy === App.state.employeeSortState.column) {
            th.classList.add('active', App.state.employeeSortState.direction);
            th.innerHTML += `<i data-lucide="${App.state.employeeSortState.direction === 'asc' ? 'arrow-up' : 'arrow-down'}" class="sort-icon w-4 h-4 inline-block"></i>`;
        } else {
            th.innerHTML += `<i data-lucide="arrow-down-up" class="sort-icon w-4 h-4 inline-block"></i>`;
        }
    });
    lucide.createIcons();

    const sortedData = [...App.state.fullSellerArray].sort((a, b) => {
        const valA = a[App.state.employeeSortState.column];
        const valB = b[App.state.employeeSortState.column];
        if (App.state.employeeSortState.column === 'name') {
            return App.state.employeeSortState.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return App.state.employeeSortState.direction === 'asc' ? valA - valB : valB - valA;
    });

    const dataToRender = (App.state.showingAllPerformers ? sortedData : sortedData.slice(0, 5))
                                        .filter(s => s.doanhThuThuc > 0);

    document.getElementById('toggle-all-performers-btn').textContent = App.state.showingAllPerformers ? 'Chỉ hiện Top 5' : 'Hiện tất cả NV';

    if (dataToRender.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-slate-500 dark:text-slate-400 py-8">Không có dữ liệu để hiển thị.</td></tr>`;
        return;
    }

    tbody.innerHTML = dataToRender.map((seller, index) => {
        let rankClass = '';
        if (index < 3) {
           rankClass = `rank-${index + 1}`;
        }
        const medals = ['🥇', '🥈', '🥉'];
        const rankDisplay = index < 3 ? medals[index] : index + 1;
        return createEmployeePerformanceTableRow(seller, rankDisplay, rankClass);
    }).join('');

    tbody.querySelectorAll('.perf-summary-row').forEach(row => {
        row.addEventListener('click', () => {
            const employeeName = row.dataset.employeeName;
            if(employeeName) showPerformanceModal(employeeName);
        });
    });
}

function createEmployeePerformanceTableRow(seller, rankDisplay, rankClass) {
    const hieuQuaClass = seller.hieuQuaValue < 35 ? 'text-red-500' : 'text-green-500';

    let traGopClass = '';
    if (seller.traGopPercent < 40) {
        traGopClass = 'text-red-500';
    } else if (seller.traGopPercent > 45) {
        traGopClass = 'text-green-500';
    }

    return `
        <tr class="perf-summary-row ${rankClass} cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50" data-employee-name="${seller.name}">
            <td class="px-2 py-3 text-center font-bold text-sm ${typeof rankDisplay === 'string' ? 'text-xl' : 'text-slate-600 dark:text-slate-300'}">${rankDisplay}</td>
            <td class="px-4 py-3 text-left font-semibold text-slate-800 dark:text-slate-100 text-sm">${abbreviateName(seller.name)}</td>
            <td class="px-4 py-3 text-right font-medium text-slate-700 dark:text-slate-300 text-sm">${formatCurrency(seller.doanhThuThuc)}</td>
            <td class="px-4 py-3 text-right font-bold text-indigo-600 dark:text-indigo-400 text-sm">${formatCurrency(seller.doanhThuQD)}</td>
            <td class="px-4 py-3 text-center font-semibold text-sm ${hieuQuaClass}">${seller.hieuQuaValue.toFixed(0)}%</td>
            <td class="px-4 py-3 text-center text-sm">${seller.slTiepCan.toLocaleString('vi-VN')}</td>
            <td class="px-4 py-3 text-center text-sm">${seller.slTraCham.toLocaleString('vi-VN')}</td>
            <td class="px-4 py-3 text-center font-semibold text-sm ${traGopClass}">${seller.traGopPercent.toFixed(0)}%</td>
        </tr>`;
}

function renderSummaryTable(data, options = { repopulateParent: true, repopulateChild: true, preserveState: false }) {
    const tableBody = document.getElementById('summary-table-body');
    const tableFooter = document.getElementById('summary-table-footer');
    const tableHeaderRow = document.getElementById('summary-table-header-row');
    const tableContainer = document.querySelector('#summary-table-container .overflow-x-auto');

    if (!tableBody || !tableFooter || !tableHeaderRow ) return;

    let expandedIds = [];
    if(options.preserveState) {
        expandedIds = [...tableBody.querySelectorAll('.summary-table-row.expanded')].map(row => row.dataset.id);
    }

    if (options.repopulateParent) {
        const allParentGroupsInScope = [...new Set(data.map(r => App.state.productConfig.childToParentMap[getRowValue(r, COL.MA_NHOM_HANG)]).filter(Boolean))];
        populateFilterDropdown('summary-nhom-cha', allParentGroupsInScope, App.state.summaryTableLocalFilters.parent);
        updateFilterLabel('summary-nhom-cha', 'Ngành');
    }

    if (options.repopulateChild) {
        const selectedParentGroups = App.state.summaryTableLocalFilters.parent;
        const dataForChildFilter = selectedParentGroups.length > 0
            ? data.filter(r => selectedParentGroups.includes(App.state.productConfig.childToParentMap[getRowValue(r, COL.MA_NHOM_HANG)]))
            : data;
        const allChildGroupsInScope = [...new Set(dataForChildFilter.map(r => App.state.productConfig.childToSubgroupMap[getRowValue(r, COL.MA_NHOM_HANG)]).filter(Boolean))];
        populateFilterDropdown('summary-nhom-con', allChildGroupsInScope, App.state.summaryTableLocalFilters.child);
        updateFilterLabel('summary-nhom-con', 'Nhóm');
    }

    const locallyFilteredData = data.filter(row => {
        const parentGroup = App.state.productConfig.childToParentMap[getRowValue(row, COL.MA_NHOM_HANG)];
        const childGroup = App.state.productConfig.childToSubgroupMap[getRowValue(row, COL.MA_NHOM_HANG)];
        const parentMatch = App.state.summaryTableLocalFilters.parent.length === 0 || (parentGroup && App.state.summaryTableLocalFilters.parent.includes(parentGroup));
        const childMatch = App.state.summaryTableLocalFilters.child.length === 0 || (childGroup && App.state.summaryTableLocalFilters.child.includes(childGroup));
        return parentMatch && childMatch;
    });

    const summaryData = buildSummaryData(locallyFilteredData);

    const sortKey = App.state.summaryTableSortState.column;
    const sortDir = App.state.summaryTableSortState.direction;

    tableHeaderRow.querySelectorAll('.sortable-header').forEach(th => {
        th.classList.remove('active', 'asc', 'desc');
        const icon = th.querySelector('.sort-icon');
        if (icon) icon.remove(); // Remove old icon

        if (th.dataset.sortBy === sortKey) {
            th.classList.add('active', sortDir);
            th.innerHTML += `<i data-lucide="${sortDir === 'asc' ? 'arrow-up' : 'arrow-down'}" class="sort-icon w-4 h-4 inline-block"></i>`;
        } else {
            th.innerHTML += `<i data-lucide="arrow-down-up" class="sort-icon w-4 h-4 inline-block"></i>`;
        }
    });
    lucide.createIcons();

    const sortedSummary = sortSummaryData(summaryData, sortKey, sortDir);

    tableBody.innerHTML = buildSummaryTableHTML(sortedSummary);
    attachSummaryTableEventListeners(tableBody);

    if(options.preserveState) {
        restoreExpandedState(expandedIds);
    }

    const grandTotal = Object.values(summaryData).reduce((acc, curr) => {
        acc.totalQuantity += curr.totalQuantity;
        acc.totalRevenue += curr.totalRevenue;
        acc.totalTraGop += curr.totalTraGop;
        acc.totalRevenueQD += curr.totalRevenueQD;
        return acc;
    }, {totalQuantity: 0, totalRevenue: 0, totalTraGop: 0, totalRevenueQD: 0});

    const gtAOV = grandTotal.totalQuantity > 0 ? grandTotal.totalRevenue / grandTotal.totalQuantity : 0;
    const gtTGP = grandTotal.totalRevenue > 0 ? (grandTotal.totalTraGop / grandTotal.totalRevenue) * 100 : 0;
    tableFooter.innerHTML = `<tr>
        <td class="px-6 py-4 text-sm text-slate-900 dark:text-slate-100 font-bold">TỔNG CỘNG</td>
        <td class="px-6 py-4 text-sm text-slate-700 dark:text-slate-200 text-right font-bold">${grandTotal.totalQuantity.toLocaleString('vi-VN')}</td>
        <td class="px-6 py-4 text-sm text-slate-800 dark:text-slate-100 text-right font-bold">${formatCurrency(grandTotal.totalRevenue)}</td>
        <td class="px-6 py-4 text-sm text-indigo-600 dark:text-indigo-400 text-right font-extrabold">${formatCurrency(grandTotal.totalRevenueQD)}</td>
        <td class="px-6 py-4 text-sm text-slate-700 dark:text-slate-200 text-right font-bold">${formatCurrency(gtAOV, 1)}</td>
        <td class="px-6 py-4 text-sm text-slate-700 dark:text-slate-200 text-right font-bold">${gtTGP.toFixed(0)}%</td>
    </tr>`;

    if (tableContainer) {
        tableContainer.style.height = 'auto';
    }

    lucide.createIcons();
}

function buildSummaryData(data) {
    const summary = {};
    const hinhThucXuatTraGop = new Set(['Xuất bán hàng trả góp Online', 'Xuất bán hàng trả góp Online giá rẻ', 'Xuất bán hàng trả góp online tiết kiệm', 'Xuất bán hàng trả góp tại siêu thị', 'Xuất bán hàng trả góp tại siêu thị (TCĐM)', 'Xuất bán trả góp ưu đãi cho nhân viên', 'Xuất đổi bảo hành sản phẩm trả góp có IMEI', 'Xuất bán trả góp cho NV phục vụ công việc']);

    const levelKeys = {
        parentGroup: (row) => App.state.productConfig.childToParentMap[getRowValue(row, COL.MA_NHOM_HANG)],
        smartGroup: (row) => App.state.productConfig.childToSubgroupMap[getRowValue(row, COL.MA_NHOM_HANG)] || 'Khác',
        manufacturer: (row) => getRowValue(row, COL.MANUFACTURER) || 'Không rõ',
        creator: (row) => getRowValue(row, COL.NGUOI_TAO) || 'Không rõ',
        product: (row) => getRowValue(row, COL.PRODUCT) || 'Không rõ',
    };

    const drilldownLevels = ['smartGroup', ...App.state.summaryTableDrilldownOrder, 'product'];

    data.forEach(row => {
        const parentGroup = levelKeys.parentGroup(row);
        if (!parentGroup) return;

        const quantity = Number(getRowValue(row, COL.QUANTITY)) || 0;
        const revenue = Number(getRowValue(row, COL.PRICE)) || 0;
        const heSoQuyDoi = getHeSoQuyDoi(getRowValue(row, COL.MA_NGANH_HANG), getRowValue(row, COL.MA_NHOM_HANG));
        const doanhThuQDRow = revenue * heSoQuyDoi;
        const isTraGop = hinhThucXuatTraGop.has(getRowValue(row, COL.HINH_THUC_XUAT) || '');
        const traGopAmount = isTraGop ? revenue : 0;

        let currentNode = summary;
        const path = [parentGroup, ...drilldownLevels.map(level => levelKeyslevel)];

        path.forEach((key) => {
            if (!currentNode[key]) {
                currentNode[key] = { totalQuantity: 0, totalRevenue: 0, totalTraGop: 0, totalRevenueQD: 0, children: {} };
            }
            currentNode[key].totalQuantity += quantity;
            currentNode[key].totalRevenue += revenue;
            currentNode[key].totalTraGop += traGopAmount;
            currentNode[key].totalRevenueQD += doanhThuQDRow;
            currentNode = currentNode[key].children;
        });
    });
    return summary;
}

function sortSummaryData(data, sortKey, sortDir) {
    const sortFn = (a, b) => {
        const nodeA = a[1];
        const nodeB = b[1];
        let valA, valB;
        switch(sortKey) {
           case 'aov':
                valA = nodeA.totalQuantity > 0 ? nodeA.totalRevenue / nodeA.totalQuantity : 0;
                valB = nodeB.totalQuantity > 0 ? nodeB.totalRevenue / nodeB.totalQuantity : 0;
                break;
           case 'traGopPercent':
                valA = nodeA.totalRevenue > 0 ? (nodeA.totalTraGop / nodeA.totalRevenue) * 100 : 0;
                valB = nodeB.totalRevenue > 0 ? (nodeB.totalTraGop / nodeB.totalRevenue) * 100 : 0;
                break;
           default:
                valA = nodeA[sortKey];
                valB = nodeB[sortKey];
        }

        if (valA === valB) return 0;
        return sortDir === 'asc' ? valA - valB : valB - valA;
    };

    const sortedData = Object.fromEntries(Object.entries(data).sort(sortFn));
    for (const key in sortedData) {
        if (Object.keys(sortedData[key].children).length > 0) {
            sortedData[key].children = sortSummaryData(sortedData[key].children, sortKey, sortDir);
        }
    }
    return sortedData;
}

function buildSummaryTableHTML(summaryData) {
    const buildRowsRecursive = (node, level, parentId) => {
        let html = '';
        const toggleIcon = `<span class="toggle-icon inline-block mr-2 text-slate-400"><i data-lucide="chevron-right" class="w-4 h-4"></i></span>`;

        for (const key in node) {
            const data = node[key];
            const hasChildren = Object.keys(data.children).length > 0;
            const aov = data.totalQuantity > 0 ? data.totalRevenue / data.totalQuantity : 0;
            const traGopPercent = data.totalRevenue > 0 ? (data.totalTraGop / data.totalRevenue) * 100 : 0;
            const currentId = `${parentId}-${key.replace(/[^a-zA-Z0-9]/g, '-')}`;
            const isExpandable = level < 5 && hasChildren;

            const displayName = level === 4 ? abbreviateName(key) : key;

            html += `<tr class="summary-table-row level-${level} ${isExpandable ? 'expandable' : ''} ${level > 1 ? 'hidden' : ''}" data-id="${currentId}" data-parent="${parentId}" data-level="${level}">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-700 dark:text-slate-200" style="padding-left: ${0.75 + (level - 1) * 1.5}rem;">
                    <div class="flex items-center">${isExpandable ? toggleIcon : ''}${displayName}</div>
                </td>
                <td class="px-6 py-4 text-right text-sm text-slate-600 dark:text-slate-300">${data.totalQuantity.toLocaleString('vi-VN')}</td>
                <td class="px-6 py-4 text-right text-sm text-slate-800 dark:text-slate-100 font-medium">${formatCurrency(data.totalRevenue)}</td>
                <td class="px-6 py-4 text-right text-sm font-medium text-indigo-600 dark:text-indigo-400">${formatCurrency(data.totalRevenueQD)}</td>
                <td class="px-6 py-4 text-right text-sm text-slate-600 dark:text-slate-300">${formatCurrency(aov, 1)}</td>
                <td class="px-6 py-4 text-right text-sm text-slate-600 dark:text-slate-300">${traGopPercent.toFixed(0)}%</td>
            </tr>`;

            if (hasChildren) {
                html += buildRowsRecursive(data.children, level + 1, currentId);
            }
        }
        return html;
    };
    return buildRowsRecursive(summaryData, 1, 'root');
}

function attachSummaryTableEventListeners(tableBodyElement) {
    if (!tableBodyElement) return;
    tableBodyElement.querySelectorAll('.expandable').forEach(row => {
        row.addEventListener('click', () => {
            const rowId = row.dataset.id;
            const isExpanded = row.classList.toggle('expanded');
            tableBodyElement.querySelectorAll(`[data-parent="${rowId}"]`).forEach(child => {
                if (isExpanded) {
                    child.classList.remove('hidden');
                } else {
                    child.classList.add('hidden');
                    child.classList.remove('expanded');
                    tableBodyElement.querySelectorAll(`[data-parent^="${child.dataset.id}"]`).forEach(desc => {
                        desc.classList.add('hidden');
                        desc.classList.remove('expanded');
                    });
                }
            });
        });
    });
}

function restoreExpandedState(expandedIds) {
    const tableBody = document.getElementById('summary-table-body');
    expandedIds.forEach(id => {
        const row = tableBody.querySelector(`[data-id="${id}"]`);
        if (row) {
            row.classList.add('expanded');
            const children = tableBody.querySelectorAll(`[data-parent="${id}"]`);
            children.forEach(child => child.classList.remove('hidden'));
        }
    });
}

function populateSegmentedControl(containerId, options, defaultActive = 'all') {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const allButton = document.createElement('button');
    allButton.dataset.value = 'all';
    allButton.className = 'py-2 px-4 text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-l-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex-1';
    allButton.textContent = 'All';
    container.appendChild(allButton);

    options.forEach((option, index) => {
        const btn = document.createElement('button');
        btn.dataset.value = option;
        let classes = 'py-2 px-4 text-sm font-medium border-t border-b border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex-1';
        if (index < options.length - 1) {
            classes += ' border-r';
        }
        if (index === options.length - 1) {
            classes += ' border-r rounded-r-md';
        }
        btn.className = classes;
        btn.textContent = option;
        container.appendChild(btn);
    });

    container.querySelector(`[data-value="${defaultActive}"]`)?.classList.add('active');

    container.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            container.querySelector('.active')?.classList.remove('active');
            e.target.classList.add('active');
            applyFilters();
        }
    });
}

function populateFilterDropdown(type, options, previouslySelected = []) {
    const panel = document.querySelector(`[data-filter-panel="${type}"]`);
    if (!panel) return;

    panel.innerHTML = ''; // Clear the panel first

    // Add search input for specific filters
    if (['nguoi-tao', 'summary-nhom-cha', 'summary-nhom-con'].includes(type)) {
        const searchContainer = document.createElement('div');
        searchContainer.className = 'mb-2 sticky top-0 bg-white dark:bg-slate-700 pt-1 pb-2';
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.dataset.searchInput = type;
        searchInput.placeholder = 'Tìm kiếm...';
        searchInput.className = 'w-full text-sm bg-slate-50 dark:bg-slate-600 border-slate-300 dark:border-slate-500 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500';

        searchInput.addEventListener('keyup', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const currentPanel = e.target.closest('[data-filter-panel]');
            if (currentPanel) {
                const optionsContainer = currentPanel.querySelector('.options-list-container');
                if (optionsContainer) {
                    optionsContainer.querySelectorAll('.option-item').forEach(item => {
                        const label = item.querySelector('label');
                        if (label && label.textContent.toLowerCase().includes(searchTerm)) {
                            item.style.display = 'flex';
                        } else {
                            item.style.display = 'none';
                        }
                    });
                }
            }
        });

        searchContainer.appendChild(searchInput);
        panel.appendChild(searchContainer);
    }

    const selectAllContainer = document.createElement('div');
    selectAllContainer.className = 'flex items-center border-b border-slate-200 dark:border-slate-600 pb-2 mb-2';
    selectAllContainer.innerHTML = `<input type="checkbox" id="select-all-${type}" data-select-all="${type}" class="h-4 w-4 rounded border-slate-300 dark:border-slate-500 text-indigo-600 focus:ring-indigo-500"><label for="select-all-${type}" class="ml-3 block text-sm font-bold text-slate-900 dark:text-slate-100 cursor-pointer">Chọn tất cả</label>`;
    panel.appendChild(selectAllContainer);

    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'options-list-container';
    options.sort().forEach(option => {
        const stringOption = String(option);
        const isChecked = Array.isArray(previouslySelected) && previouslySelected.includes(stringOption);
        const optionContainer = document.createElement('div');
        optionContainer.className = 'flex items-center mt-1.5 option-item';
        const optionId = stringOption.replace(/[^a-zA-Z0-9]/g, '-');
        optionContainer.innerHTML = `<input type="checkbox" id="cb-${type}-${optionId}" name="${type}" value="${stringOption}" ${isChecked ? 'checked' : ''} class="h-4 w-4 rounded border-slate-300 dark:border-slate-500 text-indigo-600 focus:ring-indigo-500"><label for="cb-${type}-${optionId}" class="ml-3 block text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">${stringOption}</label>`;
        optionsContainer.appendChild(optionContainer);
    });
    panel.appendChild(optionsContainer);

    const selectAllCheckbox = panel.querySelector(`[data-select-all="${type}"]`);
    selectAllCheckbox.checked = Array.isArray(previouslySelected) && previouslySelected.length === options.length && options.length > 0;

    const isSummaryFilter = type.startsWith('summary-');

    selectAllCheckbox.addEventListener('change', (e) => {
        panel.querySelectorAll(`input[name="${type}"]`).forEach(cb => cb.checked = e.target.checked);
        if (isSummaryFilter) {
            const filterKey = type.replace('summary-', '');
            App.state.summaryTableLocalFilters[filterKey] = getSelectedCheckboxes(type);
            if (filterKey === 'parent') {
                App.state.summaryTableLocalFilters.child = [];
                renderSummaryTable(App.state.validSalesData, { repopulateParent: false, repopulateChild: true });
            } else {
                renderSummaryTable(App.state.validSalesData, { repopulateParent: false, repopulateChild: false });
            }
            updateFilterLabel(type, filterKey === 'parent' ? 'Ngành' : 'Nhóm');
        } else {
            applyFilters();
        }
    });
}

function updateFilterLabel(type, defaultLabel) {
    const selected = getSelectedCheckboxes(type);
    const labelEl = document.querySelector(`[data-filter-label="${type}"]`);
    if (labelEl) {
        const allOptionsCount = document.querySelectorAll(`input[name="${type}"]`).length;
        if (selected.length === 0) {
           labelEl.textContent = defaultLabel;
        } else if (selected.length === allOptionsCount) {
           labelEl.textContent = 'Tất cả';
        } else {
           labelEl.textContent = `${selected.length} đã chọn`;
        }
    }
}

function showPerformanceModal(employeeName) {
    const modal = document.getElementById('performance-modal');
    const titleEl = document.getElementById('performance-modal-title');
    const kpisContainer = document.getElementById('performance-kpis');
    const industryChartCanvas = document.getElementById('employee-industry-chart');
    const detailsBody = document.getElementById('performance-details-body');
    const searchInput = document.getElementById('performance-search-input');
    const isDark = document.documentElement.classList.contains('dark');

    const employeeData = App.state.fullSellerArray.find(e => e.name === employeeName);
    if (!employeeData) return;

    titleEl.textContent = employeeName;

    // 1. Populate KPIs
    const kpiData = [
        { label: 'Doanh Thu QĐ', value: formatCurrency(employeeData.doanhThuQD), icon: 'wallet-cards', color: 'blue' },
        { label: 'HIỆU QUẢ QĐ', value: `${employeeData.hieuQuaValue.toFixed(0)}%`, icon: 'trending-up', color: 'purple' },
        { label: 'T.Cận', value: employeeData.slTiepCan.toLocaleString('vi-VN'), icon: 'users', color: 'green' },
        { label: '% Trả Chậm', value: `${employeeData.traGopPercent.toFixed(0)}%`, icon: 'clock', color: 'yellow' }
    ];
    kpisContainer.innerHTML = kpiData.map(kpi => `
        <div class="chart-card bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm flex items-center gap-4">
            <div class="flex-shrink-0 w-12 h-12 rounded-lg bg-${kpi.color}-100 dark:bg-${kpi.color}-900/50 text-${kpi.color}-600 dark:text-${kpi.color}-400 flex items-center justify-center"><i data-lucide="${kpi.icon}" class="w-6 h-6"></i></div>
            <div>
                <h4 class="text-slate-500 dark:text-slate-400 font-semibold text-sm">${kpi.label}</h4>
                <p class="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">${kpi.value}</p>
            </div>
        </div>
    `).join('');
    lucide.createIcons();

    const employeeTransactions = App.state.validSalesData.filter(row => getRowValue(row, COL.NGUOI_TAO) === employeeName);
    const displayTransactions = employeeTransactions.filter(row => (Number(getRowValue(row, COL.PRICE)) || 0) > 0);

    // 2. Populate Industry Proportion Chart
    const revenueByIndustry = {};
    employeeTransactions.forEach(row => {
        const mainGroup = App.state.productConfig.childToParentMap[getRowValue(row, COL.MA_NHOM_HANG)];
        if (mainGroup) {
            if (!revenueByIndustry[mainGroup]) revenueByIndustry[mainGroup] = 0;
            revenueByIndustry[mainGroup] += Number(getRowValue(row, COL.PRICE)) || 0;
        }
    });

    if (App.chartInstances.employeeIndustry) {
        App.chartInstances.employeeIndustry.destroy();
    }
    const sortedIndustries = Object.entries(revenueByIndustry).sort((a, b) => b[1] - a[1]);

    App.chartInstances.employeeIndustry = new Chart(industryChartCanvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: sortedIndustries.map(([industry]) => industry),
            datasets: [{
                data: sortedIndustries.map(([, revenue]) => revenue),
                backgroundColor: ['#4f46e5', '#818cf8', '#a78bfa', '#c4b5fd', '#34d399', '#6ee7b7', '#f59e0b', '#fbbf24', '#ef4444', '#f87171'],
                borderColor: isDark ? '#1e293b' : '#ffffff',
                borderWidth: 2,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) label += ': ';
                            if (context.parsed !== null) {
                                const total = context.chart.getDatasetMeta(0).total;
                                const percentage = total > 0 ? (context.parsed / total * 100).toFixed(1) : 0;
                                label += `${formatCurrency(context.parsed)} (${percentage}%)`;
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });


    // 3. Aggregate transactions by customer for the card view
    const customerSummary = {};
    const attachedProductsCategories = new Set(['Phụ kiện', 'Gia dụng', 'Bảo hiểm', 'Sim', 'VIEON']);
    const hinhThucXuatTraGop = new Set(['Xuất bán hàng trả góp Online', 'Xuất bán hàng trả góp Online giá rẻ', 'Xuất bán hàng trả góp online tiết kiệm', 'Xuất bán hàng trả góp tại siêu thị', 'Xuất bán hàng trả góp tại siêu thị (TCĐM)', 'Xuất bán trả góp ưu đãi cho nhân viên', 'Xuất đổi bảo hành sản phẩm trả góp có IMEI', 'Xuất bán trả góp cho NV phục vụ công việc']);

    displayTransactions.forEach(row => {
        const customerName = getRowValue(row, COL.CUSTOMER_NAME) || 'Khách lẻ';
        if(!customerSummary[customerName]) {
            customerSummary[customerName] = { products: [], totalRevenueQD: 0, isInstallment: false };
        }
        const price = Number(getRowValue(row, COL.PRICE)) || 0;
        const heSoQuyDoi = getHeSoQuyDoi(getRowValue(row, COL.MA_NGANH_HANG), getRowValue(row, COL.MA_NHOM_HANG));

        customerSummary[customerName].products.push(row);
        customerSummary[customerName].totalRevenueQD += price * heSoQuyDoi;
        if (hinhThucXuatTraGop.has(getRowValue(row, COL.HINH_THUC_XUAT))) {
            customerSummary[customerName].isInstallment = true;
        }
    });

    const sortedCustomerCards = Object.entries(customerSummary).sort((a,b) => {
        const totalA = a[1].products.reduce((sum, p) => sum + (Number(getRowValue(p, COL.PRICE)) || 0), 0);
        const totalB = b[1].products.reduce((sum, p) => sum + (Number(getRowValue(p, COL.PRICE)) || 0), 0);
        return totalB - totalA;
    });

    const renderCustomerCards = (customerList) => {
        if (customerList.length === 0) {
            detailsBody.innerHTML = '<p class="text-center text-slate-500 dark:text-slate-400">Không có giao dịch hợp lệ.</p>';
            return;
        }
        detailsBody.innerHTML = customerList.map(([name, data]) => {
            const mainProduct = data.products.reduce((max, p) => (Number(getRowValue(p, COL.PRICE)) || 0) > (Number(getRowValue(max, COL.PRICE)) || 0) ? p : max, data.products[0]);
            const attachedProducts = data.products.filter(p => p !== mainProduct && attachedProductsCategories.has(App.state.productConfig.childToParentMap[getRowValue(p, COL.MA_NHOM_HANG)]));
            const totalRevenue = data.products.reduce((sum, p) => sum + (Number(getRowValue(p, COL.PRICE)) || 0), 0);
            const hieuQuaQDValue = totalRevenue > 0 ? ((data.totalRevenueQD - totalRevenue) / totalRevenue) * 100 : 0;
            const hieuQuaQDClass = hieuQuaQDValue < 35 ? 'text-red-500' : 'text-green-500';

            return `
            <div class="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 customer-card">
                <div class="flex justify-between items-start">
                    <div>
                        <h5 class="font-bold text-indigo-700 dark:text-indigo-400 flex items-center">${name}
                            ${data.isInstallment ? `<span class="text-xs font-semibold bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full ml-2">Trả chậm</span>` : ''}
                        </h5>
                        <p class="text-sm text-slate-600 dark:text-slate-400 mt-1">
                            <span>DT Thực: <strong>${formatCurrency(totalRevenue)}</strong></span>
                            <span class="mx-2 text-slate-300 dark:text-slate-600">|</span>
                            <span class="font-bold ${hieuQuaQDClass}">HQQĐ: ${hieuQuaQDValue.toFixed(0)}%</span>
                        </p>
                    </div>
                    <div class="text-right flex-shrink-0 ml-4">
                        <p class="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400">${formatCurrency(data.totalRevenueQD)}</p>
                        <p class="text-xs text-slate-500 dark:text-slate-400 -mt-1">Doanh thu QĐ</p>
                    </div>
                </div>
                <div class="mt-3 border-t border-slate-200 dark:border-slate-700 pt-3">
                    <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Sản phẩm chính</p>
                    <p class="text-sm text-slate-800 dark:text-slate-200">${getRowValue(mainProduct, COL.PRODUCT)} - <span class="font-medium">${formatCurrency(Number(getRowValue(mainProduct, COL.PRICE)))}</span></p>
                </div>
                ${attachedProducts.length > 0 ? `
                <div class="mt-3 border-t border-slate-200 dark:border-slate-700 pt-3">
                    <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Sản phẩm bán kèm</p>
                    <ul class="text-sm text-slate-600 dark:text-slate-300 list-disc list-inside mt-1 space-y-1">
                        ${attachedProducts.map(p => `<li>${getRowValue(p, COL.PRODUCT)} - <span class="font-medium">${formatCurrency(Number(getRowValue(p, COL.PRICE)))}</span></li>`).join('')}
                    </ul>
                </div>` : ''}
            </div>
            `;
        }).join('');
    };

    renderCustomerCards(sortedCustomerCards);

    searchInput.value = '';
    searchInput.onkeyup = () => {
        const term = searchInput.value.toLowerCase();
        const filteredCustomers = sortedCustomerCards.filter(([name, data]) =>
            name.toLowerCase().includes(term) || data.products.some(p => (getRowValue(p, COL.PRODUCT) || '').toLowerCase().includes(term))
        );
        renderCustomerCards(filteredCustomers);
    };

    // 4. Render industry detail table for the employee
    renderPerfSummaryTable(employeeName);


    // 5. Show Modal
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.querySelector('.modal-content').classList.remove('scale-95', 'opacity-0');
    }, 10);
    lucide.createIcons();
}

function renderPerfSummaryTable(employeeName) {
    const tableBody = document.querySelector('#performance-modal #perf-summary-table-body');
    const tableFooter = document.querySelector('#performance-modal #perf-summary-table-footer');
    if (!tableBody || !tableFooter) return;

    const employeeData = App.state.validSalesData.filter(row => getRowValue(row, COL.NGUOI_TAO) === employeeName);
    const summaryData = buildSummaryData(employeeData);
    const sortedSummary = sortSummaryData(summaryData, 'totalRevenue', 'desc');

    tableBody.innerHTML = buildSummaryTableHTML(sortedSummary);
    attachSummaryTableEventListeners(tableBody);

    const grandTotal = Object.values(summaryData).reduce((acc, curr) => {
        acc.totalQuantity += curr.totalQuantity;
        acc.totalRevenue += curr.totalRevenue;
        acc.totalRevenueQD += curr.totalRevenueQD;
        acc.totalTraGop += curr.totalTraGop;
        return acc;
    }, {totalQuantity: 0, totalRevenue: 0, totalTraGop: 0, totalRevenueQD: 0});

    const gtAOV = grandTotal.totalQuantity > 0 ? grandTotal.totalRevenue / grandTotal.totalQuantity : 0;
    const gtTGP = grandTotal.totalRevenue > 0 ? (grandTotal.totalTraGop / grandTotal.totalRevenue) * 100 : 0;
    tableFooter.innerHTML = `<tr>
        <td class="px-6 py-4 text-sm text-slate-900 dark:text-slate-100 font-bold">TỔNG CỘNG</td>
        <td class="px-6 py-4 text-sm text-slate-700 dark:text-slate-200 text-right font-bold">${grandTotal.totalQuantity.toLocaleString('vi-VN')}</td>
        <td class="px-6 py-4 text-sm text-slate-800 dark:text-slate-100 text-right font-bold">${formatCurrency(grandTotal.totalRevenue)}</td>
        <td class="px-6 py-4 text-sm text-indigo-600 dark:text-indigo-400 text-right font-extrabold">${formatCurrency(grandTotal.totalRevenueQD)}</td>
        <td class="px-6 py-4 text-sm text-slate-700 dark:text-slate-200 text-right font-bold">${formatCurrency(gtAOV, 1)}</td>
        <td class="px-6 py-4 text-sm text-slate-700 dark:text-slate-200 text-right font-bold">${gtTGP.toFixed(0)}%</td>
    </tr>`;
    lucide.createIcons();
}

function showUnshippedOrdersModal() {
    const modal = document.getElementById('unshipped-orders-modal');
    const modalBody = document.getElementById('unshipped-orders-modal-body');
    modalBody.innerHTML = '';

    const unshippedData = App.state.filteredData.filter(row => {
         const getString = (k) => (getRowValue(row, k) || '').toString().trim().toLowerCase();
         return getRowValue(row, COL.XUAT) === 'Chưa xuất' &&
             getString(COL.TRANG_THAI_HUY) === 'chưa hủy' &&
             getString(COL.TINH_TRANG_NHAP_TRA) === 'chưa trả' &&
             (Number(getRowValue(row, COL.PRICE)) || 0) > 0;
    });

    if (unshippedData.length === 0) {
        modalBody.innerHTML = '<p class="text-center text-slate-500 dark:text-slate-400 p-4">Không có đơn hàng nào chờ xuất.</p>';
    } else {
         const groupedByCreator = unshippedData.reduce((acc, row) => {
            const creator = getRowValue(row, COL.NGUOI_TAO) || 'Không xác định';
            if (!acc[creator]) acc[creator] = { orders: [], totalRevenue: 0 };
            const price = Number(getRowValue(row, COL.PRICE)) || 0;
            acc[creator].orders.push(row);
            acc[creator].totalRevenue += price;
            return acc;
        }, {});

        const sortedCreators = Object.entries(groupedByCreator)
            .filter(([_, data]) => data.totalRevenue > 0)
            .sort((a, b) => b[1].totalRevenue - a[1].totalRevenue);

        const accordionContainer = document.createElement('div');
        accordionContainer.className = 'space-y-2';

        sortedCreators.forEach(([creator, creatorData]) => {
            const creatorId = `creator-details-${creator.replace(/[^a-zA-Z0-9]/g, '-')}`;
            const orders = creatorData.orders;
            const totalCreatorRevenue = creatorData.totalRevenue;

            const groupedByCustomer = orders.reduce((acc, row) => {
                const customer = getRowValue(row, COL.CUSTOMER_NAME) || 'Khách lẻ';
                if (!acc[customer]) acc[customer] = { orders: [], totalRevenue: 0 };
                const price = Number(getRowValue(row, COL.PRICE)) || 0;
                acc[customer].orders.push(row);
                acc[customer].totalRevenue += price;
                return acc;
            }, {});

            const creatorDetails = document.createElement('details');
            creatorDetails.id = creatorId;
            creatorDetails.className = 'bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 open:shadow-lg';
            let customerHTML = '';

            Object.entries(groupedByCustomer).sort((a,b) => b[1].totalRevenue - a[1].totalRevenue).forEach(([customer, customerData]) => {
                customerHTML += `
                <details class="ml-4 my-2 border-l-2 border-slate-200 dark:border-slate-600">
                     <summary class="p-2 pl-3 font-semibold cursor-pointer flex justify-between items-center text-slate-700 dark:text-slate-200">
                        <span>${customer}</span>
                        <div class="flex items-center gap-4">
                            <span class="text-xs font-medium text-slate-500 dark:text-slate-400">Tổng DT: <strong class="text-indigo-600 dark:text-indigo-400">${formatCurrency(customerData.totalRevenue)}</strong></span>
                            <i data-lucide="chevron-down" class="accordion-icon transition-transform w-4 h-4"></i>
                        </div>
                    </summary>
                    <div class="border-t border-slate-200 dark:border-slate-700 overflow-x-auto">
                        <table class="min-w-full text-sm">
                            <thead class="bg-slate-50 dark:bg-slate-700/50">
                                <tr>
                                    <th class="p-2 text-left font-semibold text-slate-500 dark:text-slate-300 text-xs">Ngày tạo</th>
                                    <th class="p-2 text-left font-semibold text-slate-500 dark:text-slate-300 text-xs">Sản phẩm</th>
                                    <th class="p-2 text-center font-semibold text-slate-500 dark:text-slate-300 text-xs">SL</th>
                                    <th class="p-2 text-right font-semibold text-slate-500 dark:text-slate-300 text-xs">DT Thực</th>
                                    <th class="p-2 text-right font-semibold text-slate-500 dark:text-slate-300 text-xs">DTQĐ</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${customerData.orders.map(row => {
                                    const price = Number(getRowValue(row, COL.PRICE)) || 0;
                                    const heSo = getHeSoQuyDoi(getRowValue(row, COL.MA_NGANH_HANG), getRowValue(row, COL.MA_NHOM_HANG));
                                    const revenueQD = price * heSo;
                                    return `
                                    <tr class="border-b border-slate-100 dark:border-slate-700 last:border-b-0">
                                        <td class="p-2 whitespace-nowrap text-xs">${row.parsedDate.toLocaleDateString('vi-VN')}</td>
                                        <td class="p-2 text-xs">${getRowValue(row, COL.PRODUCT)}</td>
                                        <td class="p-2 text-center text-xs">${getRowValue(row, COL.QUANTITY)}</td>
                                        <td class="p-2 text-right text-xs">${formatCurrency(price)}</td>
                                        <td class="p-2 text-right text-xs font-semibold text-indigo-500">${formatCurrency(revenueQD)}</td>
                                    </tr>`
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </details>
                `;
            });

            creatorDetails.innerHTML = `
                <summary class="p-4 font-bold cursor-pointer flex justify-between items-center text-slate-800 dark:text-slate-100">
                    <span class="flex-1 min-w-0 truncate">${creator}</span>
                    <div class="flex items-center gap-2 flex-shrink-0">
                        <button title="Xuất ảnh của nhân viên này" class="export-creator-btn p-1.5 bg-green-100 text-green-700 rounded-md hover:bg-green-200" data-creator-id="${creatorId}" data-creator-name="${creator}">
                            <i data-lucide="download" class="w-4 h-4"></i>
                        </button>
                        <span class="text-sm font-medium text-slate-500 dark:text-slate-400">Tổng DT: <strong class="text-indigo-600 dark:text-indigo-400">${formatCurrency(totalCreatorRevenue)}</strong></span>
                        <i data-lucide="chevron-down" class="accordion-icon transition-transform"></i>
                    </div>
                </summary>
                <div class="p-2 border-t border-slate-200 dark:border-slate-700">
                    ${customerHTML}
                </div>
            `;
            accordionContainer.appendChild(creatorDetails);
        });
        modalBody.appendChild(accordionContainer);
    }

    document.getElementById('toggle-all-unshipped-btn')?.addEventListener('click', (e) => {
        const details = modalBody.querySelectorAll('details');
        const shouldOpen = e.target.textContent.includes('Hiện');
        details.forEach(detail => detail.open = shouldOpen);
        e.target.textContent = shouldOpen ? 'Ẩn tất cả' : 'Hiện tất cả';
    });

    modalBody.querySelectorAll('.export-creator-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const creatorId = e.currentTarget.dataset.creatorId;
            const creatorName = e.currentTarget.dataset.creatorName;
            const elementToExport = document.getElementById(creatorId);
            exportElementAsImage(elementToExport, `cho-xuat-${creatorName}.png`, { buttonToUpdate: e.currentTarget, forceOpenDetails: true, elementsToHide: ['.export-creator-btn'] });
        });
    });

    lucide.createIcons();
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.querySelector('.modal-content').classList.remove('scale-95', 'opacity-0');
    }, 10);
}

function showIndustryDetailModal(groupName) {
    const modal = document.getElementById('industry-detail-modal');
    const modalBody = document.getElementById('industry-detail-modal-body');
    const modalTitle = document.getElementById('industry-detail-modal-title');

    modalTitle.textContent = groupName;

    const renderTable = () => {
        const container = document.getElementById('industry-detail-modal-body');
        const activeToggle = document.querySelector('#industry-detail-toggle button.active');
        const drilldownOrder = activeToggle.dataset.order.split(',');

        const industryData = App.state.validSalesData.filter(row => App.state.productConfig.childToParentMap[getRowValue(row, COL.MA_NHOM_HANG)] === groupName);

        const specialGroups = ['Smartphone', 'Laptop', 'Máy lọc nước'];
        const hasSubgroups = !specialGroups.includes(groupName) && App.state.productConfig.subgroups[groupName] && Object.keys(App.state.productConfig.subgroups[groupName]).length > 0;

        const finalDrilldownLevels = hasSubgroups ? ['subgroup', ...drilldownOrder, 'product'] : [...drilldownOrder, 'product'];

        const detailData = buildSummaryDataForModal(industryData, finalDrilldownLevels);
        const tableHTML = buildDetailTableHTML(detailData);

        container.innerHTML = tableHTML ? `<div class="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">${tableHTML}</div>` : '<p class="text-center text-slate-500 dark:text-slate-400">Không có dữ liệu chi tiết.</p>';
        attachSummaryTableEventListeners(container);
        lucide.createIcons();
    };

    const toggle = document.getElementById('industry-detail-toggle');
    // Clone and replace to remove old event listeners
    const newToggle = toggle.cloneNode(true);
    toggle.parentNode.replaceChild(newToggle, toggle);

    newToggle.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' && !e.target.classList.contains('active')) {
            newToggle.querySelector('.active').classList.remove('active');
            e.target.classList.add('active');
            renderTable();
        }
    });

    renderTable();

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.querySelector('.modal-content').classList.remove('scale-95', 'opacity-0');
    }, 10);
}

function buildSummaryDataForModal(data, drilldownLevels) {
    const summary = {};
    const hinhThucXuatTraGop = new Set(['Xuất bán hàng trả góp Online', 'Xuất bán hàng trả góp Online giá rẻ', 'Xuất bán hàng trả góp online tiết kiệm', 'Xuất bán hàng trả góp tại siêu thị', 'Xuất bán hàng trả góp tại siêu thị (TCĐM)', 'Xuất bán trả góp ưu đãi cho nhân viên', 'Xuất đổi bảo hành sản phẩm trả góp có IMEI', 'Xuất bán trả góp cho NV phục vụ công việc']);
    const levelKeys = {
        subgroup: (row) => App.state.productConfig.childToSubgroupMap[getRowValue(row, COL.MA_NHOM_HANG)] || 'Khác',
        manufacturer: (row) => getRowValue(row, COL.MANUFACTURER) || 'Không rõ',
        creator: (row) => getRowValue(row, COL.NGUOI_TAO) || 'Không rõ',
        product: (row) => getRowValue(row, COL.PRODUCT) || 'Không rõ',
    };

    data.forEach(row => {
        let currentNode = summary;
        const path = drilldownLevels.map(level => levelKeyslevel);

        path.forEach(key => {
             if (!currentNode[key]) {
                currentNode[key] = { totalQuantity: 0, totalRevenue: 0, totalTraGop: 0, totalRevenueQD: 0, children: {} };
            }
            const price = Number(getRowValue(row, COL.PRICE)) || 0;
            const quantity = Number(getRowValue(row, COL.QUANTITY)) || 0;
            const heSo = getHeSoQuyDoi(getRowValue(row, COL.MA_NGANH_HANG), getRowValue(row, COL.MA_NHOM_HANG));

            currentNode[key].totalQuantity += quantity;
            currentNode[key].totalRevenue += price;
            currentNode[key].totalRevenueQD += price * heSo;
            if (hinhThucXuatTraGop.has(getRowValue(row, COL.HINH_THUC_XUAT))) {
                currentNode[key].totalTraGop += price;
            }
            currentNode = currentNode[key].children;
        });
    });
    return summary;
}

function buildDetailTableHTML(summaryData) {
    if (Object.keys(summaryData).length === 0) return '';
    const header = `
        <table class="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead class="bg-slate-50 dark:bg-slate-800"><tr>
                <th class="px-6 py-3 text-left text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Chi Tiết</th>
                <th class="px-6 py-3 text-right text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">S.Lượng</th>
                <th class="px-6 py-3 text-right text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">D.Thu</th>
                <th class="px-6 py-3 text-right text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">DTQĐ</th>
                <th class="px-6 py-3 text-right text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">GTĐH</th>
            </tr></thead>
            <tbody class="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                ${buildDetailRowsRecursive(summaryData, 1, 'detail-root')}
            </tbody>
        </table>`;
    return header;
}

function buildDetailRowsRecursive(node, level, parentId) {
    let html = '';
    const sortedKeys = Object.keys(node).sort((a, b) => node[b].totalRevenue - node[a].totalRevenue);

    for (const key of sortedKeys) {
        const data = node[key];
        const hasChildren = Object.keys(data.children).length > 0;
        const aov = data.totalQuantity > 0 ? data.totalRevenue / data.totalQuantity : 0;
        const currentId = `${parentId}-${key.replace(/[^a-zA-Z0-9]/g, '-')}`;
        const isExpandable = level < 4 && hasChildren;
        const toggleIcon = `<span class="toggle-icon inline-block mr-2 text-slate-400"><i data-lucide="chevron-right" class="w-4 h-4"></i></span>`;

        html += `<tr class="summary-table-row level-${level} ${isExpandable ? 'expandable' : ''} ${level > 1 ? 'hidden' : ''}" data-id="${currentId}" data-parent="${parentId}" data-level="${level}">
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-700 dark:text-slate-200" style="padding-left: ${0.75 + (level - 1) * 1.5}rem;">
                <div class="flex items-center">${isExpandable ? toggleIcon : ''}${key}</div>
            </td>
            <td class="px-6 py-4 text-right text-sm text-slate-600 dark:text-slate-300">${data.totalQuantity.toLocaleString('vi-VN')}</td>
            <td class="px-6 py-4 text-right text-sm text-slate-800 dark:text-slate-100 font-medium">${formatCurrency(data.totalRevenue)}</td>
            <td class="px-6 py-4 text-right text-sm font-medium text-indigo-600 dark:text-indigo-400">${formatCurrency(data.totalRevenueQD)}</td>
            <td class="px-6 py-4 text-right text-sm text-slate-600 dark:text-slate-300">${formatCurrency(aov, 1)}</td>
        </tr>`;
        if (hasChildren) {
            html += buildDetailRowsRecursive(data.children, level + 1, currentId);
        }
    }
    return html;
}

async function exportElementAsImage(element, filename, options = {}) {
    const { buttonToUpdate, elementsToHide = [], forceOpenDetails = false, fitContent = false } = options;
    const loadingOverlay = document.getElementById('export-loading-overlay');

    let originalButtonContent = '';
    if (buttonToUpdate) {
        originalButtonContent = buttonToUpdate.innerHTML;
    }

    loadingOverlay.classList.remove('hidden');
    if (buttonToUpdate) {
        buttonToUpdate.disabled = true;
        buttonToUpdate.innerHTML = `<i data-lucide="loader-2" class="animate-spin w-5 h-5"></i>`;
        lucide.createIcons();
    }

    elementsToHide.forEach(s => document.querySelectorAll(s).forEach(e => e.style.visibility = 'hidden'));

    document.body.classList.add('is-capturing');
    window.scrollTo(0, 0);

    const scrollableElements = element.querySelectorAll('[style*="overflow"]');
    const originalStyles = new Map();
    scrollableElements.forEach(el => {
        originalStyles.set(el, {
            overflow: el.style.overflow, overflowX: el.style.overflowX,
            overflowY: el.style.overflowY, maxHeight: el.style.maxHeight,
            height: el.style.height,
        });
        el.style.overflow = 'visible'; el.style.overflowX = 'visible';
        el.style.overflowY = 'visible'; el.style.maxHeight = 'none';
        el.style.height = 'auto';
    });

    const detailsToHandle = forceOpenDetails ? element.querySelectorAll('details') : [];
    const detailsOriginalState = new Map();
    detailsToHandle.forEach(d => {
        detailsOriginalState.set(d, d.open);
        d.open = true
    });

    let originalContainerCssText = null;
    let originalTableClasses = new Map();

    if (fitContent) {
        originalContainerCssText = element.style.cssText;
        element.style.width = 'fit-content';
        element.style.margin = '0 auto';

        const tables = element.querySelectorAll('table');
        tables.forEach(table => {
            originalTableClasses.set(table, table.className);
            table.classList.remove('min-w-full');
        });
    }


    await new Promise(resolve => setTimeout(resolve, 250));

    try {
        const canvas = await html2canvas(element, {
            scale: 3,
            useCORS: true,
            backgroundColor: document.documentElement.classList.contains('dark') ? '#0f172a' : '#f8fafc',
            logging: false,
            letterRendering: true,
        });
        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (error) {
        console.error(`Lỗi khi xuất ảnh: ${filename}`, error);
        if (buttonToUpdate) {
           buttonToUpdate.innerHTML = `<i data-lucide="alert-triangle" class="h-5 w-5"></i>`;
           lucide.createIcons();
        }
    } finally {
        document.body.classList.remove('is-capturing');

        if (fitContent) {
            element.style.cssText = originalContainerCssText;
            originalTableClasses.forEach((className, table) => {
                table.className = className;
            });
        }

        scrollableElements.forEach(el => {
            const styles = originalStyles.get(el);
            if (styles) {
                el.style.overflow = styles.overflow; el.style.overflowX = styles.overflowX;
                el.style.overflowY = styles.overflowY; el.style.maxHeight = styles.maxHeight;
                el.style.height = styles.height;
            }
        });

        detailsToHandle.forEach(d => {
            d.open = detailsOriginalState.get(d)
        });

        elementsToHide.forEach(s => document.querySelectorAll(s).forEach(e => e.style.visibility = ''));

        if (buttonToUpdate) {
            buttonToUpdate.disabled = false;
            buttonToUpdate.innerHTML = originalButtonContent;
            lucide.createIcons();
        }
        loadingOverlay.classList.add('hidden');
    }
}