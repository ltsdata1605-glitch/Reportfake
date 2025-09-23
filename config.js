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