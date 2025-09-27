// --- Global State & Config ---
let App = {
    state: {
        originalData: [],
        filteredData: [],
        validSalesData: [],
        fullSellerArray: [],
        showingAllSellers: false,
        showingAllPerformers: false,
        employeeSortState: { column: 'hieuQuaValue', direction: 'desc' },
        summaryTableSortState: { column: 'totalRevenue', direction: 'desc' },
        summaryTableLocalFilters: { parent: [], child: [] },
        summaryTableDrilldownOrder: ['manufacturer', 'creator'],
        trendState: { view: 'shift', metric: 'thuc', data: {} },
        productConfig: {
            groups: {},
            subgroups: {},
            childToParentMap: {},
            childToSubgroupMap: {}
        }
    },
    chartInstances: {},
};

// --- DOM Elements ---
const fileUploadInput = document.getElementById('file-upload');
const googleSheetUrlInput = document.getElementById('google-sheet-url');
const statusContainer = document.getElementById('status-container');
const statusMessage = document.getElementById('status-message');
const statusIcon = document.getElementById('status-icon');
const progressBar = document.getElementById('progress-bar');
const dashboardWrapper = document.getElementById('dashboard-wrapper');
const uploadContainer = document.getElementById('upload-container');
const newFileBtn = document.getElementById('new-file-btn');

// --- Column Name Constants ---
const COL = {
    ID: ['Mã Đơn Hàng', 'Mã đơn hàng'],
    PRODUCT: ['Tên Sản Phẩm', 'Tên sản phẩm'],
    CUSTOMER_NAME: ['Tên Khách Hàng', 'Tên khách hàng'],
    QUANTITY: ['Số Lượng', 'Số lượng'],
    PRICE: ['Giá bán_1'],
    KHO: ['Mã kho tạo'],
    TRANG_THAI: ['Trạng thái hồ sơ'],
    NGUOI_TAO: ['Người tạo'],
    XUAT: ['Trạng thái xuất'],
    DATE_CREATED: ['Ngày tạo'],
    HINH_THUC_XUAT: ['Hình thức xuất'],
    TINH_TRANG_NHAP_TRA: ['Tình trạng nhập trả của sản phẩm đổi với sản phẩm chính'],
    TRANG_THAI_THU_TIEN: ['Trạng thái thu tiền'],
    TRANG_THAI_HUY: ['Trạng thái hủy'],
    MA_NGANH_HANG: ['Ngành Hàng', 'Ngành hàng'],
    MA_NHOM_HANG: ['Nhóm Hàng', 'Nhóm hàng'],
    MANUFACTURER: ['Nhà sản xuất', 'Hãng']
};

// --- Page Initializer ---
function initializePage() {
    // Drag and Drop Setup
    const dropZoneElement = document.querySelector(".drop-zone");
    dropZoneElement.addEventListener("dragover", e => { e.preventDefault(); dropZoneElement.classList.add("drop-zone--over"); });
    ["dragleave", "dragend"].forEach(type => dropZoneElement.addEventListener(type, () => dropZoneElement.classList.remove("drop-zone--over")));
    dropZoneElement.addEventListener("drop", e => {
        e.preventDefault();
        if (e.dataTransfer.files.length) {
            fileUploadInput.files = e.dataTransfer.files;
            handleFile({ target: fileUploadInput });
        }
        dropZoneElement.classList.remove("drop-zone--over");
    });

    fileUploadInput.addEventListener('change', handleFile);
    
    // Render icons on load
    lucide.createIcons();
}

// --- Initialize Google Charts ---
google.charts.load('current', { 'packages': ['corechart'] });
google.charts.setOnLoadCallback(initializePage);

// --- Core Logic ---
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

// --- Filter Functions --- 
function setupFilterEventListeners() { 
    document.querySelectorAll('[data-filter-btn]').forEach(btn => { 
        btn.addEventListener('click', (e) => { 
            e.stopPropagation(); 
            const type = btn.dataset.filterBtn; 
            const panel = document.querySelector(`[data-filter-panel="${type}"]`); 
            const isActive = !panel.classList.contains('hidden'); 
            document.querySelectorAll('[data-filter-panel]').forEach(p => p.classList.add('hidden')); 
            document.querySelectorAll('[data-filter-btn]').forEach(b => b.classList.remove('active')); 
            if (!isActive) { 
                panel.classList.remove('hidden'); 
                btn.classList.add('active'); 
            } 
        }); 
    }); 

    document.addEventListener('click', (e) => { 
        if (!e.target.closest('[data-filter-container]')) { 
            document.querySelectorAll('[data-filter-panel]').forEach(p => p.classList.add('hidden')); 
            document.querySelectorAll('[data-filter-btn]').forEach(b => b.classList.remove('active')); 
        } 
    }); 

    document.getElementById('filter-section').querySelectorAll('[data-filter-panel]').forEach(panel => { 
        panel.addEventListener('click', e => e.stopPropagation()); 
        panel.addEventListener('change', applyFilters); 
    }); 
    
    const dateFilterContainer = document.getElementById('date-filter-container');
    dateFilterContainer.addEventListener('click', (e) => { 
        if (e.target.tagName === 'BUTTON') { 
            dateFilterContainer.querySelector('.active')?.classList.remove('active'); 
            e.target.classList.add('active'); 
            const range = e.target.dataset.range; 
            
            let start, end; 
            const now = new Date(); 
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); 


            switch (range) { 
                case 'today': start = today; end = today; break; 
                case 'yesterday':
                    start = new Date(today);
                    start.setDate(today.getDate() - 1);
                    end = start;
                    break;
                case 'week': { 
                    start = new Date(today); 
                    const day = start.getDay(); 
                    const diff = start.getDate() - day + (day === 0 ? -6 : 1); 
                    start.setDate(diff); 
                    end = new Date(start); 
                    end.setDate(start.getDate() + 6); 
                    break; 
                } 
                case 'last-week': {
                    start = new Date(today); 
                    start.setDate(start.getDate() - 7); 
                    const day = start.getDay(); 
                    const diff = start.getDate() - day + (day === 0 ? -6 : 1); 
                    start.setDate(diff); 
                    end = new Date(start); 
                    end.setDate(start.getDate() + 6); 
                    break; 
                } 
                case 'month': 
                    start = new Date(today.getFullYear(), today.getMonth(), 1); 
                    end = new Date(today.getFullYear(), today.getMonth() + 1, 0); 
                    break; 
                case 'last-month':
                    start = new Date(today.getFullYear(), today.getMonth() - 1, 1); 
                    end = new Date(today.getFullYear(), today.getMonth(), 0); 
                    break; 
                case 'all': default: start = null; end = null; break; 
            } 
            
            document.getElementById('start-date').value = toLocalISOString(start); 
            document.getElementById('end-date').value = toLocalISOString(end); 
            
            applyFilters(); 
        } 
    }); 
    document.getElementById('start-date').addEventListener('change', () => { dateFilterContainer.querySelector('.active')?.classList.remove('active'); applyFilters(); }); 
    document.getElementById('end-date').addEventListener('change', () => { dateFilterContainer.querySelector('.active')?.classList.remove('active'); applyFilters(); }); 
    document.getElementById('reset-filters-btn').onclick = () => resetFilters(true); 
} 

function initializeDashboard() { 
    setupFilterEventListeners(); 
    setupTableControlEvents(); 
    setupGlobalControlEvents(); 
    setupEmployeeAnalysisTabs(); 
    setupModalControls(); 
    setupTrendChartControls(); 
    setupPerformanceModalTabs(); 
    resetFilters(false); 
    applyFilters(); 
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

function getSelectedCheckboxes(type) { 
    return Array.from(document.querySelectorAll(`input[name="${type}"]:checked`)).map(cb => cb.value); 
} 

function applyFilters() { 
    document.getElementById('loading-overlay').classList.remove('hidden'); 
    setTimeout(() => { 
        const selectedKho = document.querySelector('#filter-kho-container .active')?.dataset.value || 'all';
        const selectedXuatRaw = document.querySelector('#filter-xuat-container .active')?.dataset.value || 'all';
        const selectedTrangThai = getSelectedCheckboxes('trang-thai'); 
        const selectedNguoiTao = getSelectedCheckboxes('nguoi-tao'); 

        let selectedXuat = selectedXuatRaw;
        if (selectedXuatRaw === 'Đã') selectedXuat = 'Đã xuất';
        if (selectedXuatRaw === 'Chưa') selectedXuat = 'Chưa xuất';

        const startDateString = document.getElementById('start-date').value; 
        const endDateString = document.getElementById('end-date').value; 
        const startDate = startDateString ? new Date(startDateString + 'T00:00:00') : null; 
        const endDate = endDateString ? new Date(endDateString + 'T23:59:59') : null; 

        App.state.filteredData = App.state.originalData.filter(row => { 
            const date = row.parsedDate; 
            if (!date) return false; 
            const dateMatch = (!startDate || date >= startDate) && (!endDate || date <= endDate); 
            if(!dateMatch) return false; 
            return (selectedKho === 'all' || getRowValue(row, COL.KHO) == selectedKho) &&
                        (selectedXuat === 'all' || getRowValue(row, COL.XUAT) == selectedXuat) &&
                        (selectedTrangThai.length === 0 || selectedTrangThai.includes(getRowValue(row, COL.TRANG_THAI))) && 
                        (selectedNguoiTao.length === 0 || selectedNguoiTao.includes(getRowValue(row, COL.NGUOI_TAO)));
        }); 
        
        updateFilterLabel('trang-thai', 'Trạng thái'); 
        updateFilterLabel('nguoi-tao', 'Người Tạo');
        updateDynamicReportTitle(); 
        processAndDrawDashboard(App.state.filteredData); 
    }, 10); 
} 

function resetFilters(triggerApply = true) { 
    const allKho = [...new Set(App.state.originalData.map(r => getRowValue(r, COL.KHO)).filter(Boolean))];
    populateSegmentedControl('filter-kho-container', allKho, 'all');
    
    const allTrangThai = [...new Set(App.state.originalData.map(r => getRowValue(r, COL.TRANG_THAI)).filter(Boolean))]; 
    populateFilterDropdown('trang-thai', allTrangThai, allTrangThai); 

    populateSegmentedControl('filter-xuat-container', ['Đã', 'Chưa'], 'all');

    updateNguoiTaoFilter(); 
    
    App.state.summaryTableLocalFilters.parent = []; 
    App.state.summaryTableLocalFilters.child = []; 
    App.state.showingAllSellers = false;
    App.state.showingAllPerformers = false;

    document.getElementById('start-date').value = ''; 
    document.getElementById('end-date').value = ''; 
    const dateFilterContainer = document.getElementById('date-filter-container');
    dateFilterContainer.querySelector('.active')?.classList.remove('active'); 
    dateFilterContainer.querySelector('[data-range="all"]').classList.add('active'); 
    if (triggerApply) applyFilters(); 
} 

function updateNguoiTaoFilter() { 
    const nguoiTaoOptions = [...new Set(App.state.originalData.map(r => getRowValue(r, COL.NGUOI_TAO)).filter(Boolean))]; 
    const previouslySelected = getSelectedCheckboxes('nguoi-tao'); 
    const validSelections = previouslySelected.filter(name => nguoiTaoOptions.includes(name)); 
    populateFilterDropdown('nguoi-tao', nguoiTaoOptions, validSelections.length > 0 ? validSelections : nguoiTaoOptions); 
    updateFilterLabel('nguoi-tao', 'Người Tạo'); 
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

        // Special handling for ICT and Gia dụng
        if (mainGroup === 'ICT') {
            if (childGroup === 'Smartphone' || childGroup === 'Laptop' || childGroup === 'Tablet') {
                mainGroup = childGroup; // Re-assign mainGroup to the specific subgroup
            } else {
                mainGroup = null; // Ignore other ICT products
            }
        } else if (mainGroup === 'Gia dụng' && childGroup === 'Máy lọc nước') {
            mainGroup = 'Máy lọc nước';
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

    const groupsToExclude = ['DCNB', 'Thẻ cào', 'Phụ kiện lắp đặt', 'Software'];
    const sortedGroupsForChart = Object.entries(revenueByMainGroup)
        .filter(([groupName, revenue]) => revenue > 0 && !groupsToExclude.includes(groupName))
        .sort(([, a], [, b]) => b - a)
        .map(([groupName, revenue]) => [groupName, revenue, quantityByMainGroup[groupName] || 0]);
    
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
    
    drawTrendChart(); 
    drawIndustryGrid(sortedGroupsForChart); 
    drawTopSellerTable(); 
    drawEmployeePerformanceTable(); 
    renderSummaryTable(App.state.validSalesData); 
    document.getElementById('loading-overlay').classList.add('hidden'); 
    lucide.createIcons();
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

function drawIndustryGrid(sortedGroups) {
    const container = document.getElementById('industry-grid-container');
    container.innerHTML = '';

    const totalRevenue = sortedGroups.reduce((sum, item) => sum + item[1], 0);
    
    const industryIcons = {
        'Smartphone': 'smartphone', 'Laptop': 'laptop', 'Tablet': 'tablet',
        'Phụ kiện': 'headphones', 'Gia dụng': 'sofa', 'Wearable': 'watch',
        'CE': 'tv', 'Bảo hiểm': 'shield-check', 'Sim': 'smartphone-nfc',
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
        <tr class="perf-summary-row ${rankClass}" data-employee-name="${seller.name}">
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
        { label: 'Doanh Thu QĐ', value: formatCurrency(employeeData.doanhThuQD), icon: '💰', color: 'blue' }, 
        { label: 'HIỆU QUẢ QĐ', value: `${employeeData.hieuQuaValue.toFixed(0)}%`, icon: '📈', color: 'purple' }, 
        { label: 'T.Cận', value: employeeData.slTiepCan.toLocaleString('vi-VN'), icon: '👥', color: 'green' }, 
        { label: '% Trả Chậm', value: `${employeeData.traGopPercent.toFixed(0)}%`, icon: '⏳', color: 'yellow' } 
    ]; 
    kpisContainer.innerHTML = kpiData.map(kpi => ` 
        <div class="chart-card bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm flex items-center gap-4"> 
            <div class="flex-shrink-0 w-12 h-12 rounded-full bg-${kpi.color}-100 dark:bg-${kpi.color}-900/50 text-${kpi.color}-600 dark:text-${kpi.color}-400 flex items-center justify-center text-2xl">${kpi.icon}</div> 
            <div> 
                <h4 class="text-slate-500 dark:text-slate-400 font-semibold text-sm">${kpi.label}</h4> 
                <p class="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">${kpi.value}</p> 
            </div> 
        </div> 
    `).join(''); 

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
        if (hinhThucXuatTraGop.has(getRowValue