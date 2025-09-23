export const App = {
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