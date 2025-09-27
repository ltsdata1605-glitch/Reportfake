document.addEventListener('DOMContentLoaded', () => {
     lucide.createIcons();
    const sortControls = document.getElementById('sort-controls');
    const toast = document.getElementById('toast-notification');
    const controlPanelDoanhThu = document.getElementById('control-panel-doanhthu');
    const controlPanelThiDua = document.getElementById('control-panel-thidua');
    const debugCheckbox = document.getElementById('debug-checkbox');
    const debugContainer = document.getElementById('debug-output-container');
    const debugOutput = document.getElementById('debug-output');

    // --- Doanh Thu Filter Elements ---
    const customSelectContainer = document.getElementById('custom-select-container');
    const filterBtn = document.getElementById('department-filter-btn');
    const selectedText = document.getElementById('selected-departments-text');
    const filterPanel = document.getElementById('department-filter-panel');
    const searchInput = document.getElementById('department-search');
    const optionsList = document.getElementById('department-options-list');
    
    // --- Thi Đua Filter Elements ---
    const thiduaDeptFilterContainer = document.getElementById('thidua-department-filter-container');
    
    // --- Thi Đua Saved Views Elements ---
    const THIDUA_VIEWS_KEY = 'thiDuaSavedViews';
    const viewNameInput = document.getElementById('thidua-view-name-input');
    const saveViewBtn = document.getElementById('thidua-save-view-btn');
    const savedViewsSelect = document.getElementById('thidua-saved-views-select');
    const loadViewBtn = document.getElementById('thidua-load-view-btn');
    const deleteViewBtn = document.getElementById('thidua-delete-view-btn');

    // --- IndexedDB Helper ---
    const dbName = 'ReportToolDB';
    const storeName = 'thiDuaViews';
    let db;

    async function initDB() {
        return new Promise((resolve, reject) => {
            if (!('indexedDB' in window)) {
                console.warn('IndexedDB not supported');
                reject('IndexedDB not supported');
                return;
            }

            const request = indexedDB.open(dbName, 1);

            request.onerror = (event) => {
                console.error('Database error:', event.target.error);
                showToast('Không thể truy cập cơ sở dữ liệu.', true);
                reject('Database error');
            };

            request.onupgradeneeded = (event) => {
                const dbInstance = event.target.result;
                if (!dbInstance.objectStoreNames.contains(storeName)) {
                    dbInstance.createObjectStore(storeName, { keyPath: 'name' });
                }
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                console.log('Database opened successfully');
                resolve(db);
            };
        });
    }

    async function saveViewToDB(view) {
        return new Promise((resolve, reject) => {
            if (!db) {
                reject('Database not initialized');
                return;
            }
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(view);
            request.onsuccess = () => resolve();
            request.onerror = (event) => {
                console.error('Error saving view:', event.target.error);
                showToast('Lỗi khi lưu phiên bản.', true);
                reject(event.target.error);
            };
        });
    }

    async function getAllViewsFromDB() {
        return new Promise((resolve, reject) => {
            if (!db) {
                reject('Database not initialized');
                return;
            }
            const transaction = db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => {
                console.error('Error getting all views:', event.target.error);
                showToast('Lỗi khi tải danh sách phiên bản.', true);
                reject(event.target.error);
            };
        });
    }

    async function deleteViewFromDB(viewName) {
        return new Promise((resolve, reject) => {
             if (!db) {
                reject('Database not initialized');
                return;
            }
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(viewName);
            request.onsuccess = () => resolve();
            request.onerror = (event) => {
                console.error('Error deleting view:', event.target.error);
                showToast('Lỗi khi xoá phiên bản.', true);
                reject(event.target.error);
            };
        });
    }

    // --- State variables ---
    let employeeData = [];
    let currentSort = { key: 'DTQĐ', order: 'desc' };
    let selectedDepartments = [];
    let currentActiveTab = 'doanhthu';
    let processedHeaders = []; 
    
    // State for Thi đua tab
    let thiDuaRawData = {};
    let thiDuaColumnOrderInfo = []; // NEW: For drag & drop column reordering
    let selectedThiDuaDepartments = [];
    let selectedThiDuaGroups = []; // This array will now maintain selection order
    let currentThiDuaCriteriaType = 'All';
    let thiDuaSort = { key: 'effectiveness', order: 'desc' }; 


    const logDebug = (message, data = null) => {
        if (!debugCheckbox.checked) return;
        const timestamp = new Date().toLocaleTimeString();
        let logEntry = `[${timestamp}] ${message}`;
        if (data !== null) {
            logEntry += `\n${JSON.stringify(data, null, 2)}`;
        }
        debugOutput.textContent += logEntry + '\n\n';
        debugOutput.scrollTop = debugOutput.scrollHeight;
    };

    const showToast = (message, isError = false) => {
        toast.textContent = message;
        toast.classList.toggle('bg-red-500', isError);
        toast.classList.toggle('bg-green-500', !isError);
        toast.classList.remove('hidden', 'translate-x-full');
        toast.classList.add('translate-x-0');
        setTimeout(() => {
            toast.classList.remove('translate-x-0');
            toast.classList.add('translate-x-full');
             setTimeout(() => toast.classList.add('hidden'), 300);
        }, 3000);
    };
    
    const splitLineSmart = (line) => {
        let cells = line.split('\t');
        if (cells.length < 2 && line.includes('  ')) {
            cells = line.split(/\s{2,}/).filter(c => c.trim() !== '');
        }
        return cells.map(c => c.trim());
    };
    
    const parseTragopData = (text) => {
        logDebug("Bắt đầu xử lý dữ liệu Trả góp");
        const allLines = text.split('\n').filter(line => !/hỗ trợ bi|copyright ©/i.test(line));
        const tableStartIndex = allLines.findIndex((line, index) => {
            if (index + 1 >= allLines.length) return false;
            const line1 = line.trim();
            const line2 = allLines[index + 1].trim();
            return (line1.includes("Nhân viên") && line1.includes("HomeCredit(HC)")) &&
                   (line2.includes("DT Trả Góp") && line2.includes("Tỷ Trọng"));
        });

        logDebug(`Tìm thấy điểm bắt đầu bảng Trả góp tại dòng: ${tableStartIndex}`);
        if (tableStartIndex === -1) {
            showToast('Không tìm thấy bảng dữ liệu Trả góp.');
            return { body: [] };
        }

        const tableLines = allLines.slice(tableStartIndex + 2); // Skip 2 header lines
        let body_raw = tableLines
            .map(line => splitLineSmart(line))
            .filter(row => row.length > 1 && row[0] !== '' && !row[0].toLowerCase().includes('tổng'));
        
        let lastMeaningfulColumn = 0;
         const findLastCol = (row) => {
             for(let i = row.length - 1; i >= 0; i--) {
                 if((row[i] || '').trim() !== '') return i;
             }
             return -1;
         };
        body_raw.forEach(row => {
            lastMeaningfulColumn = Math.max(lastMeaningfulColumn, findLastCol(row));
        });
        const columnCount = lastMeaningfulColumn + 1;
        
        let body = body_raw.map(row => row.slice(0, columnCount));
        
        logDebug("Dữ liệu body của Trả góp", body);
        return { body };
    };

    const shortenEmployeeName = (nameString) => {
        if (!nameString || !nameString.includes(' - ')) {
            return nameString;
        }
        const parts = nameString.split(' - ');
        let name = parts[0].trim();
        let id = parts[1].trim();
        if (!isNaN(parseInt(name, 10))) { 
            [id, name] = [name, id];
        }
        const nameParts = name.split(' ').filter(p => p.trim() !== '');
        if (nameParts.length <= 1) {
            return `${id} - ${name}`;
        }
        const firstNameInitial = nameParts[0].charAt(0).toUpperCase();
        const lastName = nameParts[nameParts.length - 1];
        const shortened = `${firstNameInitial}.${lastName}`;
        return `${id} - ${shortened}`;
    };

    const shortenDepartmentName = (nameString) => {
        const lowerCaseName = nameString.toLowerCase();
        if (lowerCaseName.includes('tư vấn')) return 'BP Tư Vấn';
        if (lowerCaseName.includes('kho')) return 'BP Kho';
        if (lowerCaseName.includes('thu ngân')) return 'BP Thu Ngân';
        if (lowerCaseName.includes('supermini')) return 'BP AIO';
        if (lowerCaseName.includes('aio')) return 'BP AIO';
        return nameString; 
    };

    const parseThiDuaData = (text) => {
        logDebug("Bắt đầu xử lý dữ liệu Thi đua");
        const allLines = text.split('\n').filter(line => line.trim() !== '' && !/hỗ trợ bi|copyright ©/i.test(line));
        if (allLines.length < 2) {
            showToast('Dữ liệu Thi đua không đủ dòng để xử lý.');
            return { headers1: [], headers2: [], body: [] };
        }

        const phongBanIndex = allLines.findIndex(line => line.trim().toLowerCase().includes('phòng ban'));
        if (phongBanIndex !== -1) {
            logDebug("Tìm thấy 'Phòng ban', bắt đầu phân tích cấu trúc cột.");
            const verticalHeaders1 = [];
            let dataStartIndex = -1;
            for (let i = phongBanIndex; i < allLines.length; i++) {
                const cells = splitLineSmart(allLines[i].trim());
                if (cells.length > 1) { 
                    dataStartIndex = i;
                    break;
                }
                verticalHeaders1.push(cells[0] || '');
            }
            if (dataStartIndex !== -1) {
                const headers1 = verticalHeaders1; 
                const remainingLines = allLines.slice(dataStartIndex);
                const h2CandidateCells = splitLineSmart(remainingLines[0]);
                const metricLikeCells = h2CandidateCells.filter(c => /^[A-ZĐLKQĐ]+$/.test(c) && c.length > 1 && c.length < 6);
                let headers2 = [], bodyStartIndex = 0;
                if ((metricLikeCells.length / h2CandidateCells.length) > 0.5) {
                    headers2 = h2CandidateCells;
                    bodyStartIndex = 1;
                }
                let body = remainingLines.slice(bodyStartIndex).map(line => splitLineSmart(line)).filter(row => row.length > 0 && row.some(cell => cell.trim() !== ''));
                body.forEach(row => {
                    if (row[0] && row[0].toLowerCase().startsWith('bp ')) {
                        row[0] = shortenDepartmentName(row[0]);
                    }
                });
                return { headers1, headers2, body };
            }
        }
        
        let header1Index = -1, header2Index = -1;
        const horizontalPhongBanIndex = allLines.findIndex(line => line.toLowerCase().includes('phòng ban'));
        if (horizontalPhongBanIndex !== -1 && horizontalPhongBanIndex + 1 < allLines.length) {
            const cells = splitLineSmart(allLines[horizontalPhongBanIndex + 1]);
            if ((cells.filter(c => /^[A-ZĐLKQĐ]+$/.test(c) && c.length > 1 && c.length < 6).length / cells.length) > 0.5) {
                 header1Index = horizontalPhongBanIndex;
                 header2Index = horizontalPhongBanIndex + 1;
            }
        }
        if (header1Index === -1) {
            for (let i = 1; i < allLines.length; i++) {
                const cellsH2 = splitLineSmart(allLines[i].trim());
                if (cellsH2.length < 4) continue;
                if ((cellsH2.filter(c => /^[A-ZĐLKQĐ]+$/.test(c) && c.length > 1 && c.length < 6).length / cellsH2.length) > 0.5) {
                     if (!/^(BP|Tổng|\d{3,}-)/i.test(allLines[i-1].trim())) {
                         header2Index = i;
                         header1Index = i - 1;
                         break;
                     }
                }
            }
        }
        if (header1Index === -1) {
            showToast('Không thể tự động xác định tiêu đề bảng Thi đua.');
            return { headers1: [], headers2: [], body: [] };
        }
        const headers1 = splitLineSmart(allLines[header1Index]);
        const headers2 = splitLineSmart(allLines[header2Index]);
        let body = allLines.slice(header2Index + 1).map(line => splitLineSmart(line)).filter(row => row.length > 0 && row.some(cell => cell.trim() !== ''));
        body.forEach(row => {
            if (row[0] && row[0].toLowerCase().startsWith('bp ')) {
                row[0] = shortenDepartmentName(row[0]);
            }
        });
        return { headers1, headers2, body };
    };

    const processDoanhThuData = (text) => {
        logDebug("Bắt đầu xử lý dữ liệu Doanh thu");
        const allLines = text.split('\n').filter(line => !/hỗ trợ bi|copyright ©/i.test(line));
        const tableStartIndex = allLines.findIndex(line => line.includes("Nhân viên") && line.includes("DTLK") && line.includes("DTQĐ"));

        if (tableStartIndex === -1) {
            employeeData = [];
            return { headers: [] };
        }

        const tableLines = allLines.slice(tableStartIndex);
        let headers_raw = splitLineSmart(tableLines[0]);
        
        let body_raw = tableLines.slice(1)
            .map(line => splitLineSmart(line))
            .filter(row => row.length > 1 && row[0] !== '' && !row[0].toLowerCase().includes('tổng'));

        const headersToExclude = ['Số lượng', 'Đơn giá'];
        const excludedIndices = [];
        headers_raw.forEach((header, index) => {
            if (headersToExclude.includes(header)) excludedIndices.push(index);
        });
        
        let headers_intermediate = headers_raw;
        let body_intermediate = body_raw;

        if (excludedIndices.length > 0) {
            headers_intermediate = headers_intermediate.filter((_, index) => !excludedIndices.includes(index));
            body_intermediate = body_intermediate.map(row => row.filter((_, index) => !excludedIndices.includes(index)));
        }

        let lastMeaningfulColumn = 0;
         const findLastCol = (row) => {
             for(let i = row.length - 1; i >= 0; i--) {
                 if((row[i] || '').trim() !== '') return i;
             }
             return -1;
         };

        lastMeaningfulColumn = Math.max(lastMeaningfulColumn, findLastCol(headers_intermediate));
        body_intermediate.forEach(row => {
            lastMeaningfulColumn = Math.max(lastMeaningfulColumn, findLastCol(row));
        });
        const columnCount = lastMeaningfulColumn + 1;

        let headers = headers_intermediate.slice(0, columnCount);
        let body = body_intermediate.map(row => row.slice(0, columnCount));
        
        let currentDepartment = 'Không xác định';
        const allEmployees = [];
        body.forEach(row => {
            const firstCell = (row[0] || '').trim();
            const isDepartment = firstCell.startsWith("BP ") || (!/\d/.test(firstCell) && firstCell.length < 30);
            if (isDepartment) currentDepartment = shortenDepartmentName(firstCell);
            else if (firstCell.includes('-') && /\d/.test(firstCell)) {
                allEmployees.push({ rowData: row, department: currentDepartment });
            }
        });
        
        const dtqdIndex = headers.indexOf('DTQĐ');
        const dtlkIndex = headers.indexOf('DTLK');
        const hieuquaIndex = headers.indexOf('Hiệu quả QĐ');
        
        employeeData = allEmployees.map(emp => ({
            ...emp,
            metrics: {
                'DTQĐ': dtqdIndex > -1 ? parseFloat((emp.rowData[dtqdIndex] || '0').replace(/,/g, '')) : 0,
                'DTLK': dtlkIndex > -1 ? parseFloat((emp.rowData[dtlkIndex] || '0').replace(/,/g, '')) : 0,
                'Hiệu quả QĐ': hieuquaIndex > -1 ? parseFloat((emp.rowData[hieuquaIndex] || '0').replace(/,/g, '')) : 0,
            }
        })).filter(emp => !isNaN(emp.metrics.DTQĐ));
        
        logDebug("Đã xử lý xong dữ liệu Doanh thu", { count: employeeData.length });
        return { headers };
    };

    const updateTitles = () => {
         const resultsTitle = document.getElementById('results-title-doanhthu');
         if(!resultsTitle) return;
         switch (currentSort.key) {
            case 'DTQĐ': resultsTitle.textContent = 'TOP BEST SELLER DOANH THU QĐ'; break;
            case 'DTLK': resultsTitle.textContent = 'TOP BEST SELLER DOANH THU THỰC'; break;
            case 'Hiệu quả QĐ': resultsTitle.textContent = 'TOP HIỆU QUẢ QUY ĐỔI'; break;
            default: resultsTitle.textContent = 'TOP BEST SELLER';
        }
    };
    
     const shortenGroupName = (name) => {
        if (!name) return name;
        const lowerName = name.toLowerCase().trim();
        const replacements = {
            'camera t9': 'Camera',
            'máy lạnh': 'M.Lạnh',
            'máy giặt, sấy': 'M.Giặt/Sấy',
            'máy nước nóng': 'M.N.Nóng',
            'laptop': 'Laptop',
            'tủ lạnh, tủ đông, tủ mát': 'T.Lạnh/Đ/M',
            'nồi chiên': 'N.Chiên',
            'nồi cơm': 'N.Cơm',
            'sản phẩm lg': 'LG',
            'tivi sony': 'Sony',
            'tiền mặt cake': 'Cake',
            'bán hàng toshiba & comfee': 'Toshiba & Comfee',
            'homecredit': 'HC',
            'fecredit & tpbank': 'FE',
            'homepaylater': 'HPL',
            'máy lọc nước': 'M.L.Nước',
            'bảo hiểm': 'B.Hiểm',
            'điện thoại & tablet android trên 7 triệu': 'Android >7tr',
            'nạp rút tiền tài khoản ngân hàng': 'Nạp Rút',
            'sim ( tất cả nhà mạng)': 'SIM',
            'phụ kiện - đồng hồ': 'PK & ĐH',
            'đồng hồ thời trang': 'Đ.Hồ',
            'quạt gió': 'Quạt',
            'vas': 'Vieon',
            'bán hàng vivo': 'Vivo',
            'bán hàng realme': 'Realme',
            'homecredit hero': 'HC Hero',
            'thi đua iphone 17 series': 'iPhone 17'
        };
        
        return replacements[lowerName] || name;
    };

    const renderGenericTable = (containerId, data) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const { headers1, headers2, body, stats, columnInfos } = data;

        if (!body || body.length === 0 || !headers1 || headers1.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500">Không có dữ liệu để hiển thị.</p>`;
            return;
        }
        
        const tableContainer = document.createElement('div');
        tableContainer.className = "overflow-x-auto relative shadow-md sm:rounded-lg";

        const table = document.createElement('table');
        table.className = "w-full text-sm table-fixed";
        
        const colgroup = document.createElement('colgroup');
        colgroup.innerHTML = `<col style="width: 180px;"><col style="width: 80px;">` + headers2.map(() => `<col style="width: 80px;">`).join('');
        table.appendChild(colgroup);
        
        const thead = document.createElement('thead');
        thead.className = "text-xs text-slate-700 uppercase";

        if (headers2 && headers2.length > 0) {
            const tr1 = document.createElement('tr');
            
            let nameHeaderHTML = `<th class="px-2 py-2 align-middle sticky-header-1 sticky-col bg-slate-100 cursor-pointer hover:bg-slate-200 thidua-sortable-header text-center whitespace-normal" data-key="_name">Nhân viên`;
            if (thiDuaSort.key === '_name') {
                nameHeaderHTML += ` <i class="fas ${thiDuaSort.order === 'desc' ? 'fa-arrow-down' : 'fa-arrow-up'} ml-1 text-blue-500"></i>`;
            } else {
                nameHeaderHTML += ` <i class="fas fa-sort ml-1 text-gray-400"></i>`;
            }
            nameHeaderHTML += `</th>`;

            let effectivenessHeaderHTML = `<th class="px-2 py-2 align-middle sticky-header-1 sticky-col bg-slate-100 cursor-pointer hover:bg-slate-200 thidua-sortable-header text-center whitespace-normal" style="left: 180px;" data-key="effectiveness">Hiệu Quả`;
            if (thiDuaSort.key === 'effectiveness') {
                effectivenessHeaderHTML += ` <i class="fas ${thiDuaSort.order === 'desc' ? 'fa-arrow-down' : 'fa-arrow-up'} ml-1 text-blue-500"></i>`;
            } else {
                effectivenessHeaderHTML += ` <i class="fas fa-sort ml-1 text-gray-400"></i>`;
            }
            effectivenessHeaderHTML += `</th>`;

            tr1.innerHTML = nameHeaderHTML + effectivenessHeaderHTML;
            
            const reorderedInfos = columnInfos;
            if (reorderedInfos) {
                reorderedInfos.forEach(info => {
                    const category = thiDuaRawData.headers1[info.originalStartIndex];
                    if (!category) return;
                    
                    let newSpan = 0;
                    for (let i = 0; i < info.span; i++) {
                        const originalColIdx = info.originalStartIndex + i;
                        const criteriaName = thiDuaRawData.headers2[originalColIdx - 1];
                        if (headers2.includes(criteriaName)) {
                            newSpan++;
                        }
                    }

                    if (newSpan === 0) return;

                    const th = document.createElement('th');
                    th.colSpan = newSpan;
                    th.className = "px-1 py-2 text-center sticky-header-1 bg-slate-100 border-b border-l border-gray-300 relative h-14 align-middle break-words";
                    th.textContent = shortenGroupName(category);

                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = "delete-col-btn";
                    deleteBtn.innerHTML = "&times;";
                    deleteBtn.dataset.originalStartIndex = info.originalStartIndex;
                    th.appendChild(deleteBtn);

                    tr1.appendChild(th);
                });
            }

            const tr2 = document.createElement('tr');
            tr2.innerHTML = `<th class="px-2 py-2 sticky-header-2 sticky-col bg-slate-100 border-b border-l border-gray-300 text-center">Tiêu chí</th><th class="px-2 py-2 sticky-header-2 sticky-col bg-slate-100 border-b border-l border-gray-300 text-center" style="left: 180px;">(Đạt/Tổng)</th>` + 
            headers2.map(h => {
                let sortIcon = ` <i class="fas fa-sort ml-1 text-gray-400"></i>`;
                if (thiDuaSort.key === h) {
                    sortIcon = ` <i class="fas ${thiDuaSort.order === 'desc' ? 'fa-arrow-down' : 'fa-arrow-up'} ml-1 text-blue-500"></i>`;
                }
                return `<th data-key="${h}" class="text-center px-1 py-2 sticky-header-2 bg-slate-100 border-b border-l border-gray-300 cursor-pointer hover:bg-slate-200 thidua-sortable-header">${h}${sortIcon}</th>`;
            }).join('');
            
            thead.appendChild(tr1);
            thead.appendChild(tr2);
        } else { 
             const tr = document.createElement('tr');
             tr.innerHTML = headers1.map(h => `<th scope="col" class="px-2 py-2 whitespace-nowrap sticky-header-1 bg-slate-100 border-b border-l border-gray-300">${h}</th>`).join('');
             thead.appendChild(tr);
        }
        
        const tbody = document.createElement('tbody');
        let isOdd = false;
        let currentDeptForRow = null;
        tbody.innerHTML = body.map((item) => {
            const row = item.rowData;
            const isTotalRow = row[0] && row[0].toLowerCase().includes('tổng');
            const isDeptRow = row[0] && row[0].toLowerCase().startsWith('bp');
            if (isDeptRow) { 
                isOdd = false;
                currentDeptForRow = row[0];
            }

            let rowClass = "bg-white border-b";
            let stickyBgClass = "bg-white";
            if(isTotalRow) { 
                rowClass = "bg-yellow-100 border-b font-bold text-gray-900";
                stickyBgClass = "bg-yellow-100";
            } 
            else if (isDeptRow) { 
                rowClass = "bg-slate-200 border-b font-bold text-slate-800";
                stickyBgClass = "bg-slate-200";
            } 
            else if (isOdd) { 
                rowClass = "bg-slate-50 border-b";
                stickyBgClass = "bg-slate-50";
            }
            
            if(!isDeptRow && !isTotalRow) { isOdd = !isOdd; }
            
            let nameContent = row[0];
            if (!isDeptRow && !isTotalRow) nameContent = shortenEmployeeName(row[0]);
            
            let warningIcon = '';
             if (!isDeptRow && !isTotalRow && item.isBottom30) {
                warningIcon = `<i class="fas fa-exclamation-triangle text-red-500 ml-auto" title="Thuộc 30% nhân viên có hiệu quả thấp nhất bộ phận"></i>`;
            }

            let rankIcon = '';
            if (!isDeptRow && !isTotalRow && item.rank) {
                if (item.rank === 1) {
                    rankIcon = '<i class="fas fa-medal text-xl text-yellow-400"></i>';
                } else if (item.rank === 2) {
                    rankIcon = '<i class="fas fa-medal text-xl text-gray-400"></i>';
                } else if (item.rank === 3) {
                    rankIcon = '<i class="fas fa-medal text-xl text-orange-500"></i>';
                }
            }
            
            let nameCellHtml = `<td class="px-2 py-2 whitespace-nowrap border-r border-gray-200 text-left font-semibold sticky-col ${stickyBgClass} align-middle">
                <div class="flex items-center gap-2">${rankIcon}<span class="flex-grow">${nameContent}</span>${warningIcon}</div>
            </td>`;

            let effectivenessCellHtml = `<td class="px-1 py-2 whitespace-nowrap border-r border-gray-200 align-middle text-center sticky-col ${stickyBgClass}" style="left: 180px;">`;
            if (item.display) {
                const [achieved, total] = item.display.split('/');
                effectivenessCellHtml += `<b class="font-bold text-blue-600">${achieved}</b><span class="text-gray-500">/${total}</span>`;
            }
            effectivenessCellHtml += `</td>`;


            const dataCellsHtml = row.slice(1).map((cell, cellIndex) => {
                let content = cell;
                let highlightClass = '';
                let highlightIcon = '';
                const originalCellIndex = cellIndex + 1;
                
                // Highlighting logic
                const value = parseFloat(String(cell).replace(/,/g, ''));
                if (!isNaN(value) && !isDeptRow && !isTotalRow && currentDeptForRow && stats) {
                     const deptStats = stats.get(currentDeptForRow);
                     if (deptStats && deptStats.columns[originalCellIndex]) {
                         const colStats = deptStats.columns[originalCellIndex];
                         if (value > 0) {
                             if (colStats.top1 !== undefined && value === colStats.top1) {
                                 highlightClass = 'bg-yellow-200 text-yellow-900 font-bold';
                                 highlightIcon = `<i class="fas fa-trophy text-yellow-500 text-xs ml-1"></i>`;
                             } else if (colStats.top2 !== undefined && value === colStats.top2) {
                                 highlightClass = 'bg-gray-200 text-gray-800 font-semibold';
                                 highlightIcon = `<i class="fas fa-medal text-gray-500 text-xs ml-1"></i>`;
                             } else if (colStats.top3 !== undefined && value === colStats.top3) {
                                 highlightClass = 'bg-orange-200 text-orange-900 font-semibold';
                                 highlightIcon = `<i class="fas fa-award text-orange-500 text-xs ml-1"></i>`;
                             } else if (value < colStats.average) {
                                 highlightClass = 'text-red-600';
                             }
                         }
                     }
                }

                // Format numbers
                if (originalCellIndex > 0) {
                    const num = parseFloat(String(cell).replace(/,/g, ''));
                    if (!isNaN(num) && num === 0) {
                        content = '';
                    } else if (!isNaN(num) && cell.includes('.')) { 
                        content = Math.floor(num).toLocaleString('en-US');
                    }
                }

                return `<td class="px-1 py-2 whitespace-nowrap border-r border-gray-200 ${highlightClass} align-middle text-center">
                    <span class="inline-flex items-center justify-center gap-x-1">${content}${highlightIcon}</span>
                </td>`;
            }).join('');

            return `<tr class="${rowClass}">${nameCellHtml}${effectivenessCellHtml}${dataCellsHtml}</tr>`;
        }).join('');
        
        table.appendChild(thead);
        table.appendChild(tbody);
        tableContainer.appendChild(table);

        container.innerHTML = '';
        container.appendChild(tableContainer);

        // Initialize SortableJS for column dragging
        const headerRow1 = thead.querySelector('tr:first-child');
        if (headerRow1 && headerRow1.children.length > 2 && containerId === 'results-container-thidua') {
            new Sortable(headerRow1, {
                animation: 150,
                filter: '.sticky-col', // Prevent dragging the first two fixed columns
                preventOnFilter: true,
                onEnd: (evt) => {
                    const oldModelIndex = evt.oldIndex - 2; // Offset by 2 for fixed columns
                    const newModelIndex = evt.newIndex - 2;
                    
                    if (oldModelIndex < 0 || newModelIndex < 0) return;

                    const [movedItem] = thiDuaColumnOrderInfo.splice(oldModelIndex, 1);
                    thiDuaColumnOrderInfo.splice(newModelIndex, 0, movedItem);

                    renderThiDuaView();
                }
            });
        }
        
        container.querySelectorAll('.delete-col-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const indexToDelete = parseInt(e.currentTarget.dataset.originalStartIndex, 10);
                thiDuaColumnOrderInfo = thiDuaColumnOrderInfo.filter(info => info.originalStartIndex !== indexToDelete);
                renderThiDuaView();
                showToast('Đã ẩn cột.');
            });
        });


        const theadForSort = container.querySelector('thead');
        if (theadForSort) {
            theadForSort.addEventListener('click', (e) => {
                const header = e.target.closest('.thidua-sortable-header');
                if (!header) return;
                const sortKey = header.dataset.key;
                if (!sortKey) return;
                
                if (thiDuaSort.key === sortKey) {
                    thiDuaSort.order = thiDuaSort.order === 'desc' ? 'asc' : 'desc';
                } else {
                    thiDuaSort.key = sortKey;
                    thiDuaSort.order = 'desc';
                }
                renderThiDuaView();
            });
        }
    };
    
     const renderTragopTable = (containerId, data) => {
        const container = document.getElementById(containerId);
        if (!container || !data || data.body.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500">Không có dữ liệu để hiển thị.</p>`;
            return;
        }
         const header_map_l1 = ["HomeCredit(HC)", "HomeCredit(HC)", "FECredit(FE)", "FECredit(FE)", "Thẻ tín dụng - SMARTPOS", "Thẻ tín dụng - SMARTPOS", "Trả góp HPL-Home Credit", "Trả góp HPL-Home Credit", "DT Siêu thị (*)", "Tỷ Trọng Trả Góp (%) (**)"];
         const header_map_l2 = ["DT Trả Góp", "Tỷ Trọng Trả Góp (%)", "DT Trả Góp", "Tỷ Trọng Trả Góp (%)", "DT Trả Góp", "Tỷ Trọng Trả Góp (%)", "DT Trả Góp", "Tỷ Trọng Trả Góp (%)", "", ""];


        const tableContainer = document.createElement('div');
        tableContainer.className = "overflow-x-auto relative shadow-md sm:rounded-lg";

        const table = document.createElement('table');
        table.className = "w-full text-sm text-left text-gray-500";
        
        const thead = document.createElement('thead');
        thead.className = "text-xs text-gray-700 uppercase bg-gray-50";
        
        thead.innerHTML = `
            <tr>
                <th rowspan="2" class="px-6 py-3 border align-middle whitespace-nowrap sticky-header-1 sticky-col bg-gray-50">Nhân viên</th>
                <th colspan="2" class="px-6 py-3 text-center border whitespace-nowrap sticky-header-1 bg-gray-50">HomeCredit(HC)</th>
                <th colspan="2" class="px-6 py-3 text-center border whitespace-nowrap sticky-header-1 bg-gray-50">FECredit(FE)</th>
                <th colspan="2" class="px-6 py-3 text-center border whitespace-nowrap sticky-header-1 bg-gray-50">Thẻ tín dụng - SMARTPOS</th>
                <th colspan="2" class="px-6 py-3 text-center border whitespace-nowrap sticky-header-1 bg-gray-50">Trả góp HPL-Home Credit</th>
                <th rowspan="2" class="px-6 py-3 border align-middle whitespace-nowrap sticky-header-1 bg-gray-50">DT Siêu thị (*)</th>
                <th rowspan="2" class="px-6 py-3 border align-middle whitespace-nowrap sticky-header-1 bg-gray-50">Tỷ Trọng Trả Góp (%) (**)</th>
            </tr>
            <tr>
                <th class="px-4 py-2 border whitespace-nowrap sticky-header-2 bg-gray-50">DT Trả Góp</th>
                <th class="px-4 py-2 border whitespace-nowrap sticky-header-2 bg-gray-50">Tỷ Trọng Trả Góp (%)</th>
                <th class="px-4 py-2 border whitespace-nowrap sticky-header-2 bg-gray-50">DT Trả Góp</th>
                <th class="px-4 py-2 border whitespace-nowrap sticky-header-2 bg-gray-50">Tỷ Trọng Trả Góp (%)</th>
                <th class="px-4 py-2 border whitespace-nowrap sticky-header-2 bg-gray-50">DT Trả Góp</th>
                <th class="px-4 py-2 border whitespace-nowrap sticky-header-2 bg-gray-50">Tỷ Trọng Trả Góp (%)</th>
                <th class="px-4 py-2 border whitespace-nowrap sticky-header-2 bg-gray-50">DT Trả Góp</th>
                <th class="px-4 py-2 border whitespace-nowrap sticky-header-2 bg-gray-50">Tỷ Trọng Trả Góp (%)</th>
            </tr>
        `;
        
        const tbody = document.createElement('tbody');
        tbody.innerHTML = data.body.map(row => {
            let rowHtml = `<tr class="bg-white border-b hover:bg-gray-50">`;
            const fullRow = [...row];
            while(fullRow.length < 11) fullRow.push('');

            fullRow.forEach((cell, index) => {
                const isPercentageColumn = [2, 4, 6, 8, 10].includes(index + 1);
                const cellClass = isPercentageColumn ? 'text-green-600 font-semibold' : '';

                if (index === 0) {
                     rowHtml += `<td class="px-6 py-4 border whitespace-nowrap sticky-col bg-white">${cell}</td>`;
                     return;
                }
                rowHtml += `<td class="px-6 py-4 border whitespace-nowrap ${cellClass}">
                    ${cell}
                </td>`;
            });
            rowHtml += `</tr>`;
            return rowHtml;
        }).join('');
        
        table.appendChild(thead);
        table.appendChild(tbody);
        tableContainer.appendChild(table);

        container.innerHTML = '';
        container.appendChild(tableContainer);
    };

    const createDepartmentSummaryRow = (department, data) => {
        const row = document.createElement('div');
        row.className = 'department-summary-row flex flex-col md:flex-row items-start md:items-center justify-between p-3 bg-gray-100 rounded-xl gap-2';
        
        let summaryMetricHtml = '';
        switch (currentSort.key) {
            case 'DTLK':
                summaryMetricHtml = `<div><div class="text-xs text-gray-500">Tổng DTLK</div><div class="text-lg font-bold text-gray-700">${Math.floor(data.totalDtlk).toLocaleString('en-US')}</div></div>`;
                break;
            case 'Hiệu quả QĐ':
                const avgHieuQua = data.employees.length > 0 ? (data.totalHieuQuaQD / data.employees.length) * 100 : 0;
                summaryMetricHtml = `<div><div class="text-xs text-gray-500">HQQĐ TB</div><div class="text-lg font-bold text-green-600">${avgHieuQua.toFixed(1)}%</div></div>`;
                break;
            case 'DTQĐ':
            default:
                 summaryMetricHtml = `<div><div class="text-xs text-gray-500">Tổng DTQĐ</div><div class="text-lg font-bold text-blue-600">${Math.floor(data.totalDtqd).toLocaleString('en-US')}</div></div>`;
                break;
        }

        row.innerHTML = `<div class="flex items-center gap-4"><h3 class="text-base font-bold text-gray-800">${department}</h3></div><div class="flex items-center space-x-4 text-right">${summaryMetricHtml}</div>`;
        return row;
    };

    const createEmployeeRow = (employee, departmentData, headers, maxMetricValue) => {
        const { rowData, rank, metrics } = employee;
        const { dtlkThreshold, dtqdThreshold } = departmentData;
        const row = document.createElement('div');
        row.className = 'employee-row flex items-center px-4 py-2 bg-white rounded-xl shadow-sm hover:shadow-md hover:bg-gray-50 hover:scale-[1.02] transition-all duration-300 row-animate';
        
        let rankContent = '';
        if (rank === 1) rankContent = '<i class="fas fa-medal text-2xl text-yellow-400"></i>';
        else if (rank === 2) rankContent = '<i class="fas fa-medal text-2xl text-gray-400"></i>';
        else if (rank === 3) rankContent = '<i class="fas fa-medal text-2xl text-orange-500"></i>';
        else rankContent = `<span class="text-xl font-bold">${rank}</span>`;
        
        const name = rowData[0] || '';
        const shortenedName = shortenEmployeeName(name);
        let metricsHtml = '';
        
        headers.forEach((header, index) => {
            if (index === 0 || header === currentSort.key) return;
            
            let formattedCell = rowData[index] || '';
            let valueClass = 'font-semibold text-gray-700';

            if (header === 'Hiệu quả QĐ') {
                const num = metrics['Hiệu quả QĐ'] * 100;
                formattedCell = !isNaN(num) ? `${parseFloat(num.toFixed(1))}%` : formattedCell;
                if (num < 35) valueClass = 'font-bold text-red-600';
                else if (num > 35) valueClass = 'font-bold text-green-600';
                else valueClass = 'font-bold text-gray-700';
            } else if (header === 'DTLK') {
                const num = metrics.DTLK;
                formattedCell = !isNaN(num) ? Math.floor(num).toLocaleString('en-US') : formattedCell;
                if (num <= dtlkThreshold) valueClass = 'font-semibold text-red-600';
            } else if (header === 'DTQĐ') {
                 const num = metrics.DTQĐ;
                formattedCell = !isNaN(num) ? Math.floor(num).toLocaleString('en-US') : formattedCell;
                if (num <= dtqdThreshold) valueClass = 'font-semibold text-red-600';
            }
            if(header) metricsHtml += `<span class="whitespace-nowrap mr-4">${header}: <strong class="${valueClass}">${formattedCell}</strong></span>`;
        });
        
        let mainMetricLabel = '';
        let mainMetricValue = '';
        let mainMetricClass = '';

        switch (currentSort.key) {
            case 'DTLK':
                mainMetricLabel = 'DTLK';
                mainMetricValue = Math.floor(metrics.DTLK).toLocaleString('en-US');
                mainMetricClass = 'text-xl font-extrabold text-blue-600';
                if (metrics.DTLK <= dtlkThreshold) mainMetricClass = 'text-xl font-extrabold text-red-600';
                break;
            case 'Hiệu quả QĐ':
                mainMetricLabel = 'HQQĐ';
                const hieuquaNum = metrics['Hiệu quả QĐ'] * 100;
                mainMetricValue = `${parseFloat(hieuquaNum.toFixed(1))}%`;
                if (hieuquaNum < 35) mainMetricClass = 'text-xl font-extrabold text-red-600';
                else if (hieuquaNum > 35) mainMetricClass = 'text-xl font-extrabold text-green-600';
                else mainMetricClass = 'text-xl font-extrabold text-gray-700';
                break;
            case 'DTQĐ':
            default:
                mainMetricLabel = 'DTQĐ';
                mainMetricValue = Math.floor(metrics.DTQĐ).toLocaleString('en-US');
                mainMetricClass = 'text-xl font-extrabold text-blue-600';
                if (metrics.DTQĐ <= dtqdThreshold) mainMetricClass = 'text-xl font-extrabold text-red-600';
                break;
        }
        
        const progressPercentage = maxMetricValue > 0 ? (metrics[currentSort.key] / maxMetricValue) * 100 : 0;
        const progressColor = mainMetricClass.includes('red') ? 'bg-red-500' : (mainMetricClass.includes('green') ? 'bg-green-500' : 'bg-blue-500');


        row.innerHTML = `<div class="flex items-center justify-center w-12 text-gray-400">${rankContent}</div>
        <div class="flex-grow min-w-0 pr-4">
            <h4 class="font-bold text-base text-gray-800 truncate">${shortenedName}</h4>
            <div class="text-xs mt-1 text-gray-500">${metricsHtml}</div>
             <div class="progress-bar-container mt-2">
                <div class="progress-bar ${progressColor}" style="width: ${progressPercentage}%"></div>
            </div>
        </div>
        <div class="text-right w-28 flex-shrink-0">
            <div class="text-xs text-gray-500">${mainMetricLabel}</div>
            <div class="${mainMetricClass}">${mainMetricValue}</div>
        </div>`;
        return row;
    };

    let departmentsData = new Map();

    const renderDoanhThuResults = (headers) => {
        processedHeaders = headers;
        const resultsContainer = document.getElementById('results-container-doanhthu');
        updateTitles();
        
        const dataToRender = selectedDepartments.length > 0
            ? employeeData.filter(emp => selectedDepartments.includes(emp.department))
            : employeeData;

        const maxMetricValue = Math.max.apply(null, dataToRender.map(emp => emp.metrics[currentSort.key]).concat([0]));

        departmentsData.clear();
        dataToRender.forEach(emp => {
            const department = emp.department;
            if (!departmentsData.has(department)) {
                departmentsData.set(department, { employees: [], totalDtqd: 0, totalDtlk: 0, totalHieuQuaQD: 0 });
            }
            const deptData = departmentsData.get(department);
            deptData.employees.push(emp);
            deptData.totalDtqd += emp.metrics.DTQĐ;
            deptData.totalDtlk += emp.metrics.DTLK;
            deptData.totalHieuQuaQD += emp.metrics['Hiệu quả QĐ'];
        });

        // Sort and rank employees WITHIN each department
        departmentsData.forEach((deptData, department) => {
            deptData.employees.sort((a, b) => {
                const valA = a.metrics[currentSort.key];
                const valB = b.metrics[currentSort.key];
                return currentSort.order === 'desc' ? valB - valA : valA - valB;
            }).forEach((emp, index) => {
                emp.rank = index + 1;
            });
        });
        
        const fullDepartmentsData = new Map();
        employeeData.forEach(emp => {
            const department = emp.department;
            if (!fullDepartmentsData.has(department)) {
                fullDepartmentsData.set(department, { employees: [] });
            }
            fullDepartmentsData.get(department).employees.push(emp);
        });

        fullDepartmentsData.forEach((data) => {
            const employees = data.employees;
            const count = employees.length;
            if (count > 0) {
                const bottomCount = Math.max(1, Math.floor(count * 0.3));
                const sortedByDtlk = [...employees].sort((a, b) => a.metrics.DTLK - b.metrics.DTLK);
                const dtlkEmployee = sortedByDtlk[bottomCount - 1];
                data.dtlkThreshold = dtlkEmployee ? dtlkEmployee.metrics.DTLK : undefined;

                const sortedByDtqd = [...employees].sort((a, b) => a.metrics.DTQĐ - b.metrics.DTQĐ);
                const dtqdEmployee = sortedByDtqd[bottomCount - 1];
                data.dtqdThreshold = dtqdEmployee ? dtqdEmployee.metrics.DTQĐ : undefined;
            }
        });
        
        resultsContainer.innerHTML = ''; 
        if (dataToRender.length === 0) {
            resultsContainer.innerHTML = `<p class="text-center text-gray-500">Không có dữ liệu để hiển thị.</p>`;
            return;
        }
        let animationIndex = 0;
        
        departmentsData.forEach((data, department) => {
            const departmentGroup = document.createElement('div');
            departmentGroup.className = 'department-group';
            departmentGroup.dataset.department = department;
            const fullDeptData = fullDepartmentsData.get(department) || {};
            departmentGroup.appendChild(createDepartmentSummaryRow(department, data));
            
            const employeeList = document.createElement('div');
            employeeList.className = 'space-y-1 mt-2';
            departmentGroup.appendChild(employeeList);

            data.employees.forEach(emp => {
                const rowElement = createEmployeeRow(emp, fullDeptData, headers, maxMetricValue);
                rowElement.style.opacity = '0';
                rowElement.style.animationDelay = `${animationIndex++ * 40}ms`;
                employeeList.appendChild(rowElement);
            });
            resultsContainer.appendChild(departmentGroup);
        });
        
        updateSortButtons();
    };
    
    const resetThiDuaColumns = () => {
        if(!thiDuaRawData.headers1) return;
        thiDuaColumnOrderInfo = [];
         let { headers1 } = thiDuaRawData;
            if(headers1){
                for (let i = 1; i < headers1.length; i++) {
                    if (headers1[i]) {
                        let span = 1;
                        while (i + span < headers1.length && !headers1[i + span]) span++;
                        thiDuaColumnOrderInfo.push({ originalStartIndex: i, span });
                        i += span - 1;
                    }
                }
            }
    };

    const processAndRender = (showSuccessToast = false) => {
        const activeTextarea = document.querySelector(`#tab-panel-${currentActiveTab} .data-textarea`);
        if (!activeTextarea) return;
        const text = activeTextarea.value;
        
        if (currentActiveTab === 'doanhthu') {
            const { headers } = processDoanhThuData(text);
            renderDoanhThuResults(headers);
            populateDepartmentFilter();
        } else if (currentActiveTab === 'tragop') {
            const data = parseTragopData(text);
            renderTragopTable('results-container-tragop', data);
        } else if (currentActiveTab === 'thidua') {
            const data = parseThiDuaData(text);
            thiDuaRawData = data;
            
            resetThiDuaColumns();

            populateThiDuaFilters();
        }

        if (showSuccessToast && text.trim()) {
            showToast('Đã xử lý dữ liệu thành công!');
        }
    };

    const processAllTabsOnLoad = () => {
        logDebug("Processing all tabs on initial load.");
        const tabs = ['doanhthu', 'thidua', 'tragop'];
        tabs.forEach(tabId => {
            const textarea = document.getElementById(`text-input-${tabId}`);
            if (!textarea || !textarea.value.trim()) return;
            const text = textarea.value;

            if (tabId === 'doanhthu') {
                const { headers } = processDoanhThuData(text);
                renderDoanhThuResults(headers);
                populateDepartmentFilter();
            } else if (tabId === 'tragop') {
                const data = parseTragopData(text);
                renderTragopTable('results-container-tragop', data);
            } else if (tabId === 'thidua') {
                const data = parseThiDuaData(text);
                thiDuaRawData = data; 
                resetThiDuaColumns();
                populateThiDuaFilters();
            }
        });
        if(document.getElementById('text-input-doanhthu').value.trim()){
            showToast('Dữ liệu mẫu đã được tải và xử lý!');
        }
    };
    
    const updateThiDuaTitle = () => {
        const titleElement = document.getElementById('results-title-thidua');
        if (!titleElement) return;

        switch(currentThiDuaCriteriaType) {
            case 'All':
                titleElement.textContent = 'HIỆU QUẢ THI ĐUA NGÀNH HÀNG';
                break;
            case 'SLLK':
                titleElement.textContent = 'HIỆU QUẢ THI ĐUA NGÀNH HÀNG THEO TIÊU CHÍ SỐ LƯỢNG';
                break;
            case 'DTQĐ':
                titleElement.textContent = 'HIỆU QUẢ THI ĐUA NGÀNH HÀNG THEO TIÊU CHÍ DOANH THU QĐ';
                break;
            case 'DTLK':
                titleElement.textContent = 'HIỆU QUẢ THI ĐUA NGÀNH HÀNG THEO TIÊU CHÍ DOANH THU THỰC';
                break;
            default:
                 titleElement.textContent = 'HIỆU QUẢ THI ĐUA NGÀNH HÀNG';
        }
    }


    const renderThiDuaView = () => {
        updateThiDuaTitle();
        const container = document.getElementById('results-container-thidua');
        const exportAllBtn = document.getElementById('export-all-thidua-btn');

        container.className = 'space-y-4';
        exportAllBtn.style.display = 'flex';
        renderThiDuaByEmployeeView();
    }


    const renderThiDuaByEmployeeView = () => {
        if (!thiDuaRawData || !thiDuaRawData.headers1 || !thiDuaRawData.body) {
            renderGenericTable('results-container-thidua', { headers1:[], headers2:[], body:[] });
            return;
        }

        let displayColumnInfos = [...thiDuaColumnOrderInfo];

        displayColumnInfos = displayColumnInfos.filter(info => {
             const groupName = thiDuaRawData.headers1[info.originalStartIndex];
             return selectedThiDuaGroups.length === 0 || selectedThiDuaGroups.includes(groupName);
        });

        if (selectedThiDuaGroups.length > 0) {
            displayColumnInfos.sort((a, b) => {
                const groupA = thiDuaRawData.headers1[a.originalStartIndex];
                const groupB = thiDuaRawData.headers1[b.originalStartIndex];
                return selectedThiDuaGroups.indexOf(groupA) - selectedThiDuaGroups.indexOf(groupB);
            });
        }
        
        if (currentThiDuaCriteriaType === 'All') {
            const criteriaOrder = { 'SLLK': 1, 'DTQĐ': 2, 'DTLK': 3 };
             displayColumnInfos.sort((a, b) => {
                const firstCriterionA = thiDuaRawData.headers2[a.originalStartIndex - 1];
                const firstCriterionB = thiDuaRawData.headers2[b.originalStartIndex - 1];
                const orderA = criteriaOrder[firstCriterionA] || 99;
                const orderB = criteriaOrder[firstCriterionB] || 99;
                return orderA - orderB;
            });
        }

        let displayHeaders1 = ['Phòng ban'];
        let displayHeaders2 = []; 
        let displayBody = thiDuaRawData.body.map(row => [row[0]]);

        displayColumnInfos.forEach(info => {
            let tempGroupH1 = [];
            let tempGroupH2 = [];
            let tempBodyCols = Array.from({ length: thiDuaRawData.body.length }, () => []);

            for (let i = 0; i < info.span; i++) {
                const originalColIdx = info.originalStartIndex + i;
                if (!thiDuaRawData.headers2[originalColIdx - 1]) continue;
                const criteriaName = thiDuaRawData.headers2[originalColIdx - 1];
                const keepCriteria = currentThiDuaCriteriaType === 'All' || criteriaName === currentThiDuaCriteriaType;

                if (keepCriteria) {
                    tempGroupH1.push(thiDuaRawData.headers1[originalColIdx] || '');
                    tempGroupH2.push(criteriaName);
                    thiDuaRawData.body.forEach((row, rowIndex) => {
                        tempBodyCols[rowIndex].push(row[originalColIdx] || '');
                    });
                }
            }

            if (tempGroupH2.length > 0) {
                displayHeaders1.push(...tempGroupH1);
                displayHeaders2.push(...tempGroupH2);
                displayBody.forEach((row, rowIndex) => {
                    row.push(...tempBodyCols[rowIndex]);
                });
            }
        });
        
        let filteredBody = displayBody;
        
        if (selectedThiDuaDepartments.length > 0) {
            const finalBody = [];
            let currentDept = '';
            let keepCurrentDept = false;
            filteredBody.forEach(row => {
                const firstCell = row[0] || '';
                const isDeptRow = firstCell.toLowerCase().startsWith('bp ') || firstCell.toLowerCase().includes('tổng');
                if(isDeptRow) {
                    currentDept = firstCell;
                    keepCurrentDept = selectedThiDuaDepartments.includes(currentDept);
                }
                if(keepCurrentDept) {
                    finalBody.push(row);
                }
            });
            filteredBody = finalBody;
        }

        const departmentStats = new Map();
        let currentDeptForStats = null;
        filteredBody.forEach(row => {
            const firstCell = (row[0] || '').toLowerCase();
            const isDeptRow = firstCell.startsWith('bp ') || firstCell.includes('tổng');

            if (isDeptRow) {
                currentDeptForStats = row[0];
                departmentStats.set(currentDeptForStats, { columns: {} });
            } else if (currentDeptForStats && !isDeptRow && !firstCell.includes('tổng')) { // Only for employees
                const stats = departmentStats.get(currentDeptForStats);
                row.forEach((cell, index) => {
                    if (index === 0) return; 
                    const value = parseFloat(String(cell).replace(/,/g, ''));
                    if (isNaN(value)) return;

                    if (!stats.columns[index]) {
                        stats.columns[index] = { values: [] };
                    }
                    stats.columns[index].values.push(value);
                });
            }
        });

        departmentStats.forEach(stats => {
            for (const key in stats.columns) {
                const col = stats.columns[key];
                const numericValues = col.values.filter(v => v > 0); 
                
                if (numericValues.length > 0) {
                    col.average = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
                    const sortedUniqueValues = [...new Set(numericValues)].sort((a, b) => b - a);
                    col.top1 = sortedUniqueValues[0];
                    col.top2 = sortedUniqueValues[1];
                    col.top3 = sortedUniqueValues[2];
                } else {
                    col.average = 0;
                    col.top1 = col.top2 = col.top3 = undefined;
                }
            }
        });

        let enrichedBody = filteredBody.map((row, rowIndex) => {
            const isDeptRow = (row[0] || '').toLowerCase().startsWith('bp ');
            const isTotalRow = (row[0] || '').toLowerCase().includes('tổng');
            if(isDeptRow || isTotalRow) {
                return { rowData: row, score: -Infinity, display: null }; 
            }

            const totalColumns = displayHeaders2.length;
            if (totalColumns === 0) {
                return { rowData: row, score: -1, display: null };
            }

            let belowAverageCount = 0;
            let currentDeptForCalc = '';
            for (let i = rowIndex; i >= 0; i--) {
                const potentialDept = filteredBody[i][0];
                if (potentialDept.toLowerCase().startsWith('bp ')) {
                    currentDeptForCalc = potentialDept;
                    break;
                }
            }
            
            const deptStats = departmentStats.get(currentDeptForCalc);
            if(deptStats){
                row.slice(1).forEach((cell, index) => {
                    const value = parseFloat(String(cell).replace(/,/g, ''));
                    const colStats = deptStats.columns[index + 1];
                    if (colStats && !isNaN(value) && value > 0 && value < colStats.average) {
                        belowAverageCount++;
                    }
                });
            }

            const aboveAverageCount = totalColumns - belowAverageCount;
            return {
                rowData: row,
                score: totalColumns > 0 ? aboveAverageCount / totalColumns : 0,
                display: `${aboveAverageCount}/${totalColumns}`
            };
        });

        // Calculate ranks and bottom 30% within each department
        const employeeGroups = new Map();
        let currentDeptForRank = null;
        enrichedBody.forEach(item => {
            const firstCell = (item.rowData[0] || '').toLowerCase();
            if (firstCell.startsWith('bp ')) {
                currentDeptForRank = item.rowData[0];
                if (!employeeGroups.has(currentDeptForRank)) {
                    employeeGroups.set(currentDeptForRank, []);
                }
            } else if (currentDeptForRank && !firstCell.startsWith('bp ') && !firstCell.includes('tổng')) {
                employeeGroups.get(currentDeptForRank).push(item);
            }
        });
        employeeGroups.forEach(group => {
            group.sort((a, b) => b.score - a.score);
            group.forEach((item, index) => {
                item.rank = index + 1;
            });
             const warnCount = Math.ceil(group.length * 0.3);
            const rankThreshold = group.length - warnCount;
            group.forEach(item => {
                if (item.rank > rankThreshold) {
                    item.isBottom30 = true;
                }
            });
        });
        
        // Now apply user-defined sorting
        const groups = [];
        let currentGroup = null;

        enrichedBody.forEach(item => {
             const firstCell = (item.rowData[0] || '').toLowerCase();
             if (firstCell.startsWith('bp ') || firstCell.includes('tổng')) {
                 if (currentGroup) groups.push(currentGroup);
                 currentGroup = { header: item, employees: [] };
             } else if (currentGroup) {
                 currentGroup.employees.push(item);
             }
        });
        if (currentGroup) groups.push(currentGroup);
        
        groups.forEach(group => {
            group.employees.sort((a, b) => {
                if (thiDuaSort.key === 'effectiveness') {
                    const valA = a.score ?? -1;
                    const valB = b.score ?? -1;
                    return thiDuaSort.order === 'desc' ? valB - valA : valA - valB;
                } 
                
                let sortIndex = -1;
                if (thiDuaSort.key === '_name') {
                    sortIndex = 0;
                } else {
                     const criteriaIndex = displayHeaders2.indexOf(thiDuaSort.key);
                     if(criteriaIndex !== -1) sortIndex = criteriaIndex + 1;
                }

                if (sortIndex !== -1) {
                    if (sortIndex === 0) { // sort by name
                        const valA = a.rowData[sortIndex] || '';
                        const valB = b.rowData[sortIndex] || '';
                        return thiDuaSort.order === 'desc' ? valB.localeCompare(valA, 'vi') : valA.localeCompare(valB, 'vi');
                    } else { // sort by metric
                        const valA = parseFloat((a.rowData[sortIndex] || '0').replace(/,/g, ''));
                        const valB = parseFloat((b.rowData[sortIndex] || '0').replace(/,/g, ''));
                        if (isNaN(valA) && isNaN(valB)) return 0;
                        if (isNaN(valA)) return 1;
                        if (isNaN(valB)) return -1;
                        return thiDuaSort.order === 'desc' ? valB - valA : valA - valB;
                    }
                }
                return 0;
            });
        });

        enrichedBody = [];
        groups.forEach(group => {
            enrichedBody.push(group.header);
            enrichedBody.push(...group.employees);
        });
        
        renderGenericTable('results-container-thidua', {
            columnInfos: displayColumnInfos,
            headers1: displayHeaders1,
            headers2: displayHeaders2,
            body: enrichedBody,
            stats: departmentStats
        });
    };

    const updateCriteriaTabsAndFilter = () => {
        const criteriaTabsContainer = document.getElementById('thidua-criteria-tabs');
        // Update button styles
        criteriaTabsContainer.querySelectorAll('.criteria-tab-btn').forEach(button => {
            const type = button.dataset.criteriaType;
            button.classList.toggle('active', currentThiDuaCriteriaType === type);
        });
        
        updateThiDuaTitle();

        renderThiDuaView();
    };

    const populateThiDuaFilters = () => {
        const deptContainer = document.getElementById('thidua-department-filter-container');
        const groupContainer = document.getElementById('thidua-group-filter-container');
        const criteriaTabsContainer = document.getElementById('thidua-criteria-tabs');
        
        if (!thiDuaRawData || !thiDuaRawData.headers1 || thiDuaRawData.headers1.length === 0) {
              deptContainer.innerHTML = '<p class="text-gray-400 text-sm">Chưa có dữ liệu để lọc...</p>';
              groupContainer.innerHTML = '<p class="text-gray-400 text-sm">Chưa có dữ liệu để lọc...</p>';
            return;
        }

        const departments = [...new Set(thiDuaRawData.body.map(row => row[0]).filter(cell => cell.toLowerCase().startsWith('bp ') || cell.toLowerCase().includes('tổng')))];
         deptContainer.innerHTML = departments.map(dept => `
             <button data-dept="${dept}" class="filter-pill thidua-dept-pill px-3 py-1 text-sm font-medium rounded-full border bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200">
                 ${dept}
            </button>
        `).join('');


        document.querySelectorAll('.thidua-dept-pill').forEach(btn => btn.addEventListener('click', () => {
            btn.classList.toggle('active');
            selectedThiDuaDepartments = [...document.querySelectorAll('.thidua-dept-pill.active')].map(el => el.dataset.dept);
            renderThiDuaView();
        }));

        const groups = [...new Set(thiDuaRawData.headers1.slice(1).filter(g => g && g.trim()))];
        groupContainer.innerHTML = groups.map(group => `
             <button data-group="${group}" class="filter-pill thidua-group-pill px-3 py-1 text-sm font-medium rounded-full border bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200">
                 ${group}
            </button>
        `).join('');
        
        document.querySelectorAll('.thidua-group-pill').forEach(btn => btn.addEventListener('click', () => {
            btn.classList.toggle('active');
            const groupName = btn.dataset.group;
            const isNowActive = btn.classList.contains('active');

            if (isNowActive) {
                if (!selectedThiDuaGroups.includes(groupName)) {
                    selectedThiDuaGroups.push(groupName);
                }
            } else {
                selectedThiDuaGroups = selectedThiDuaGroups.filter(g => g !== groupName);
            }
            renderThiDuaView();
        }));

        criteriaTabsContainer.addEventListener('click', (e) => {
            const button = e.target.closest('.criteria-tab-btn');
            if (!button) return;
            currentThiDuaCriteriaType = button.dataset.criteriaType;
            updateCriteriaTabsAndFilter();
        });
        
        document.getElementById('thidua-dept-select-all').addEventListener('click', () => {
            document.querySelectorAll('.thidua-dept-pill').forEach(b => b.classList.add('active'));
            selectedThiDuaDepartments = departments;
            renderThiDuaView();
        });
         document.getElementById('thidua-dept-deselect-all').addEventListener('click', () => {
            document.querySelectorAll('.thidua-dept-pill').forEach(b => b.classList.remove('active'));
            selectedThiDuaDepartments = [];
            renderThiDuaView();
        });
        document.getElementById('thidua-group-select-all').addEventListener('click', () => {
            document.querySelectorAll('.thidua-group-pill').forEach(b => b.classList.add('active'));
            selectedThiDuaGroups = groups;
            renderThiDuaView();
        });
         document.getElementById('thidua-group-deselect-all').addEventListener('click', () => {
            document.querySelectorAll('.thidua-group-pill').forEach(b => b.classList.remove('active'));
            selectedThiDuaGroups = [];
            renderThiDuaView();
        });
         document.getElementById('thidua-reset-cols-btn').addEventListener('click', () => {
            resetThiDuaColumns();
            renderThiDuaView();
            showToast('Đã đặt lại thứ tự cột.');
        });

        // Set default view on load
        updateCriteriaTabsAndFilter();
    };

    const updateSelectedText = () => {
        if (selectedDepartments.length === 0) {
            selectedText.textContent = 'Chọn một hoặc nhiều bộ phận';
            selectedText.classList.add('text-gray-500');
            selectedText.classList.remove('text-gray-900');
        } else if (selectedDepartments.length === 1) {
            selectedText.textContent = selectedDepartments[0];
            selectedText.classList.remove('text-gray-500');
            selectedText.classList.add('text-gray-900');
        } else {
            selectedText.textContent = `Đã chọn ${selectedDepartments.length} bộ phận`;
            selectedText.classList.remove('text-gray-500');
            selectedText.classList.add('text-gray-900');
        }
    };

    const populateDepartmentFilter = () => {
        const departments = [...new Set(employeeData.map(e => e.department))];
        optionsList.innerHTML = '';
        departments.forEach(dept => {
            const li = document.createElement('li');
            li.className = 'p-2 hover:bg-gray-100 rounded-md';
            li.innerHTML = `<label class="flex items-center space-x-2 w-full cursor-pointer"><input type="checkbox" value="${dept}" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 department-checkbox"><span class="text-sm text-gray-800">${dept}</span></label>`;
            const checkbox = li.querySelector('.department-checkbox');
            if (selectedDepartments.includes(dept)) checkbox.checked = true;
            checkbox.addEventListener('change', (e) => {
                const deptName = e.target.value;
                if (e.target.checked) {
                    if (!selectedDepartments.includes(deptName)) selectedDepartments.push(deptName);
                } else {
                    selectedDepartments = selectedDepartments.filter(d => d !== deptName);
                }
                updateSelectedText();
                renderDoanhThuResults(processedHeaders);
            });
            optionsList.appendChild(li);
        });
        updateSelectedText();
    };
    
    const updateSortButtons = () => {
        document.querySelectorAll('.sort-btn').forEach(btn => {
            const key = btn.dataset.key;
            btn.classList.remove('bg-blue-500', 'text-white');
            btn.classList.add('bg-gray-200', 'text-gray-700');
            const icon = btn.querySelector('i');
            if (icon) icon.remove();
            if (key === currentSort.key) {
                btn.classList.add('bg-blue-500', 'text-white');
                btn.classList.remove('bg-gray-200', 'text-gray-700');
                const icon = document.createElement('i');
                icon.className = `fas fa-arrow-${currentSort.order === 'desc' ? 'down' : 'up'} ml-1`;
                btn.appendChild(icon);
            }
        });
    };
    
    // --- Saved Views Logic ---
    const loadThiDuaViewsDropdown = async () => {
        try {
            const views = await getAllViewsFromDB();
            savedViewsSelect.innerHTML = '<option value="">-- Chọn phiên bản để tải --</option>'; // Reset
            views.forEach(view => {
                const option = document.createElement('option');
                option.value = view.name;
                option.textContent = view.name;
                savedViewsSelect.appendChild(option);
            });
        } catch(e) {
            console.error("Lỗi khi đọc từ IndexedDB:", e);
            showToast('Không thể tải các phiên bản đã lưu.', true);
        }
    };

    const saveThiDuaView = async () => {
        const name = viewNameInput.value.trim();
        if (!name) {
            showToast('Vui lòng nhập tên cho phiên bản.', true);
            return;
        }
        
        try {
            const newView = {
                name: name,
                columnOrderInfo: thiDuaColumnOrderInfo,
                selectedDepartments: selectedThiDuaDepartments,
                selectedGroups: selectedThiDuaGroups,
                criteriaType: currentThiDuaCriteriaType, // Save the active tab
                sort: thiDuaSort,
            };

            await saveViewToDB(newView);
            
            await loadThiDuaViewsDropdown();
            savedViewsSelect.value = name; // Select the newly saved view
            viewNameInput.value = ''; // Clear input
            showToast(`Đã lưu phiên bản "${name}" thành công!`);
        } catch(e) {
            console.error("Lỗi khi lưu vào IndexedDB:", e);
            showToast('Không thể lưu phiên bản.', true);
        }
    };
    
    const updateThiDuaFilterPillsFromState = () => {
        document.querySelectorAll('.thidua-dept-pill').forEach(pill => {
            pill.classList.toggle('active', selectedThiDuaDepartments.includes(pill.dataset.dept));
        });
        document.querySelectorAll('.thidua-group-pill').forEach(pill => {
            pill.classList.toggle('active', selectedThiDuaGroups.includes(pill.dataset.group));
        });
        // Note: Criteria pills are not managed here because they are tabs now
    };

    const loadThiDuaView = async () => {
        const name = savedViewsSelect.value;
        if (!name) {
            showToast('Vui lòng chọn một phiên bản để tải.', true);
            return;
        }
        try {
            const views = await getAllViewsFromDB();
            const viewToLoad = views.find(v => v.name === name);

            if (!viewToLoad) {
                showToast(`Không tìm thấy phiên bản "${name}".`, true);
                return;
            }

            // Restore state from saved view
            thiDuaColumnOrderInfo = viewToLoad.columnOrderInfo || [];
            selectedThiDuaDepartments = viewToLoad.selectedDepartments || [];
            selectedThiDuaGroups = viewToLoad.selectedGroups || [];
            thiDuaSort = viewToLoad.sort || { key: null, order: 'desc' };
            currentThiDuaCriteriaType = viewToLoad.criteriaType || 'SLLK'; // Restore the tab

            updateThiDuaFilterPillsFromState();
            updateCriteriaTabsAndFilter(); // Update UI and re-render with new state
            showToast(`Đã tải phiên bản "${name}".`);
        } catch(e) {
            console.error("Lỗi khi tải phiên bản từ IndexedDB:", e);
            showToast('Không thể tải phiên bản đã lưu. Dữ liệu có thể bị lỗi.', true);
        }
    };

    const deleteThiDuaView = async () => {
        const name = savedViewsSelect.value;
        if (!name) {
            showToast('Vui lòng chọn một phiên bản để xoá.', true);
            return;
        }
        try {
            await deleteViewFromDB(name);
            await loadThiDuaViewsDropdown();
            showToast(`Đã xoá phiên bản "${name}".`);
        } catch(e) {
            console.error("Lỗi khi xoá phiên bản từ IndexedDB:", e);
            showToast('Không thể xoá phiên bản đã lưu.', true);
        }
    };


    // --- Event Listeners ---
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');
    const resultsPanels = document.querySelectorAll('.results-panel');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => {
                btn.classList.remove('border-blue-500', 'text-blue-600');
                btn.classList.add('border-transparent', 'text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');
            });
            tabPanels.forEach(panel => panel.classList.add('hidden'));
            resultsPanels.forEach(panel => panel.classList.add('hidden'));

            const tab = button.dataset.tab;
            currentActiveTab = tab;
            button.classList.add('border-blue-500', 'text-blue-600');
            button.classList.remove('border-transparent', 'text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');
            
            const activeInputPanel = document.getElementById(`tab-panel-${tab}`);
            activeInputPanel.classList.remove('hidden');
            
            const activeResultsPanel = document.getElementById(`results-panel-${tab}`);
            activeResultsPanel.classList.remove('hidden');

            controlPanelDoanhThu.style.display = tab === 'doanhthu' ? 'block' : 'none';
            controlPanelThiDua.style.display = tab === 'thidua' ? 'block' : 'none';

            // Data is already processed on load, so no need to call processAndRender here unless data is empty
            const resultsContainer = activeResultsPanel.querySelector('.space-y-4, .grid');
            if (resultsContainer && resultsContainer.innerHTML.trim() === '') {
                processAndRender(false);
            }
        });
    });

    document.querySelectorAll('.data-textarea').forEach(textarea => {
        textarea.addEventListener('input', () => processAndRender(true));
    });
    
    document.querySelectorAll('.paste-btn').forEach(button => {
        button.addEventListener('click', () => {
            const targetTextarea = document.getElementById(button.dataset.targetTextarea);
            targetTextarea.focus();
            showToast('Ô nhập liệu đã sẵn sàng, vui lòng nhấn Ctrl+V để dán.');
        });
    });

     document.querySelectorAll('.clear-btn').forEach(button => {
         button.addEventListener('click', (e) => {
              const targetTextarea = document.getElementById(e.currentTarget.dataset.targetTextarea);
              targetTextarea.value = '';
              processAndRender(false); // Re-process to clear results
              showToast('Đã xoá dữ liệu.');
              targetTextarea.focus();
         });
    });

    sortControls.addEventListener('click', (e) => {
        const button = e.target.closest('.sort-btn');
        if (!button) return;
        const sortKey = button.dataset.key;
        if (currentSort.key === sortKey) {
            currentSort.order = currentSort.order === 'desc' ? 'asc' : 'desc';
        } else {
            currentSort.key = sortKey;
            currentSort.order = 'desc';
        }
        renderDoanhThuResults(processedHeaders);
    });

    const captureAndDownload = (captureElement, fileName, buttonElement) => {
        if (!captureElement) {
            console.error("Capture area not found for export.");
            showToast("Lỗi: Không tìm thấy vùng để xuất ảnh.");
            return;
        }

        const loadingOverlay = document.getElementById('loading-overlay');
        const originalButtonHtml = buttonElement.innerHTML;

        // Show loading indicators
        loadingOverlay.classList.remove('hidden');
        buttonElement.disabled = true;
        buttonElement.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;

        const body = document.body;
        body.classList.add('is-capturing');
        window.scrollTo(0, 0);

        // Give a short delay for styles to apply and UI to settle
        setTimeout(() => {
            html2canvas(captureElement, {
                scale: 5,
                useCORS: true,
                backgroundColor: '#ffffff',
                onclone: (clonedDoc) => {
                    const panel = clonedDoc.getElementById(captureElement.id);
                    if (!panel) return;

                     // Fix for sticky headers causing alignment issues
                    const stickyElements = panel.querySelectorAll('[class*="sticky"]');
                    stickyElements.forEach(el => {
                        el.style.position = 'static';
                    });

                    // Ensure full table width is captured for overflowing tables
                    const tableContainer = panel.querySelector('.overflow-x-auto');
                    if (tableContainer) {
                        tableContainer.style.overflow = 'visible';
                        tableContainer.style.width = 'auto';
                        panel.style.width = 'fit-content';
                    } else {
                        // For non-table layouts (like Doanh Thu), shrink to fit content
                        panel.style.width = 'fit-content';
                        panel.style.minWidth = '700px'; 
                    }
                }
            }).then(canvas => {
                const link = document.createElement('a');
                link.download = fileName;
                link.href = canvas.toDataURL('image/png');
                link.click();
                showToast('Đã xuất ảnh thành công!');
            }).catch(err => {
                console.error("html2canvas error:", err);
                showToast("Có lỗi xảy ra khi xuất ảnh.");
            }).finally(() => {
                // Hide loading indicators and cleanup
                body.classList.remove('is-capturing');
                loadingOverlay.classList.add('hidden');
                buttonElement.disabled = false;
                buttonElement.innerHTML = originalButtonHtml;
            });
        }, 250);
    };
    
    document.getElementById('export-doanhthu-btn').addEventListener('click', (e) => {
        const captureArea = document.getElementById('results-panel-doanhthu');
        captureAndDownload(captureArea, 'bao-cao-doanh-thu.png', e.currentTarget);
    });

    document.getElementById('export-thidua-btn').addEventListener('click', (e) => {
        const captureArea = document.getElementById('results-panel-thidua');
        captureAndDownload(captureArea, 'bao-cao-thi-dua.png', e.currentTarget);
    });

    const exportAllThiDuaBtn = document.getElementById('export-all-thidua-btn');
    const delay = ms => new Promise(res => setTimeout(res, ms));

    exportAllThiDuaBtn.addEventListener('click', async () => {
        const originalCriteriaType = currentThiDuaCriteriaType;
        const criteriaToExport = ['All', 'SLLK', 'DTQĐ', 'DTLK'];
        const loadingOverlay = document.getElementById('loading-overlay');
        
        loadingOverlay.classList.remove('hidden');
        exportAllThiDuaBtn.disabled = true;
        const originalBtnHtml = exportAllThiDuaBtn.innerHTML;
        exportAllThiDuaBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';


        try {
            for (const criteria of criteriaToExport) {
                const tabToClick = document.querySelector(`.criteria-tab-btn[data-criteria-type="${criteria}"]`);
                if(tabToClick) tabToClick.click();
                await delay(500); 

                const captureArea = document.getElementById('results-panel-thidua');
                const canvas = await html2canvas(captureArea, {
                     scale: 5, useCORS: true, backgroundColor: '#ffffff',
                     onclone: (clonedDoc) => {
                        const panel = clonedDoc.getElementById(captureArea.id);
                        if(!panel) return;
                        const stickyElements = panel.querySelectorAll('[class*="sticky"]');
                        stickyElements.forEach(el => { el.style.position = 'static'; });
                        const tableContainer = panel.querySelector('.overflow-x-auto');
                        if (tableContainer) {
                            tableContainer.style.overflow = 'visible';
                            tableContainer.style.width = 'auto';
                            panel.style.width = 'fit-content';
                        }
                    }
                });

                const link = document.createElement('a');
                link.download = `bao-cao-thi-dua-${criteria}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
                
                await delay(300); 
            }
            showToast('Đã xuất tất cả báo cáo thành công!');
        } catch (err) {
            console.error("Lỗi khi xuất hàng loạt:", err);
            showToast("Có lỗi xảy ra khi xuất hàng loạt.", true);
        } finally {
             const originalTab = document.querySelector(`.criteria-tab-btn[data-criteria-type="${originalCriteriaType}"]`);
             if(originalTab) {
                originalTab.click();
             } else {
                const fallbackTab = document.querySelector(`.criteria-tab-btn[data-criteria-type="All"]`);
                if(fallbackTab) fallbackTab.click();
             }
            loadingOverlay.classList.add('hidden');
            exportAllThiDuaBtn.disabled = false;
            exportAllThiDuaBtn.innerHTML = originalBtnHtml;
        }
    });


    // --- Event Listeners for Dropdowns ---
    filterBtn.addEventListener('click', () => filterPanel.classList.toggle('hidden'));
    
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        optionsList.querySelectorAll('li').forEach(li => {
            li.style.display = li.textContent.toLowerCase().includes(searchTerm) ? '' : 'none';
        });
    });


    window.addEventListener('click', (e) => {
        if (customSelectContainer && !customSelectContainer.contains(e.target)) {
            const filterPanel = document.getElementById('department-filter-panel');
            if(filterPanel) filterPanel.classList.add('hidden');
        }
        const thiduaSelectContainer = document.getElementById('thidua-select-container');
        if (thiduaSelectContainer && !thiduaSelectContainer.contains(e.target)) {
            const thiduaFilterPanel = document.getElementById('thidua-department-filter-panel');
            if(thiduaFilterPanel) thiduaFilterPanel.classList.add('hidden');
        }
    });

    // --- Changelog Modal Logic ---
    const versionBadge = document.getElementById('version-badge');
    const changelogModal = document.getElementById('changelog-modal');
    const closeChangelogModalBtn = document.getElementById('close-changelog-modal');

    if (versionBadge && changelogModal && closeChangelogModalBtn) {
        versionBadge.addEventListener('click', () => {
            changelogModal.classList.remove('hidden');
        });

        closeChangelogModalBtn.addEventListener('click', () => {
            changelogModal.classList.add('hidden');
        });

        changelogModal.addEventListener('click', (e) => {
            // Close if clicked on the overlay background
            if (e.target === changelogModal) {
                changelogModal.classList.add('hidden');
            }
        });
    }

    // --- Initial Load & Storage Check ---
    async function initializeApp() {
        const viewManagementSection = document.getElementById('thidua-view-name-input').closest('div.p-3');
        try {
            await initDB();
            await loadThiDuaViewsDropdown();
            
             const viewManagementContainer = document.getElementById('thidua-saved-views-select').parentElement;
             if(viewManagementContainer && viewManagementContainer.nextElementSibling && !viewManagementContainer.nextElementSibling.classList.contains('storage-warning')) {
                const warning = document.createElement('p');
                warning.className = "text-xs text-gray-500 mt-2 storage-warning";
                warning.innerHTML = `Lưu ý: Dữ liệu được lưu trên trình duyệt này. Sẽ bị mất nếu dùng chế độ ẩn danh hoặc xoá dữ liệu duyệt web.`;
                viewManagementContainer.insertAdjacentElement('afterend', warning);
            }
        } catch(error) {
            let message = 'Tính năng quản lý phiên bản không hoạt động do bộ nhớ trình duyệt bị tắt hoặc không được hỗ trợ (ví dụ: chế độ ẩn danh).';
             if (viewManagementSection) {
                viewManagementSection.innerHTML = `<p class="text-sm text-center text-red-600 p-2 bg-red-50 rounded-md">${message}</p>`;
             }
        }
        
        processAllTabsOnLoad();

        debugCheckbox.addEventListener('change', () => {
            debugContainer.classList.toggle('hidden', !debugCheckbox.checked);
        });

        // Event listeners for saved views
        saveViewBtn.addEventListener('click', saveThiDuaView);
        loadViewBtn.addEventListener('click', loadThiDuaView);
        deleteViewBtn.addEventListener('click', deleteThiDuaView);
    }

    initializeApp();
});