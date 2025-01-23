"use client"

import { useEffect, useState, useCallback } from "react"
import { database } from "../../../../firebase/firebaseConfig"
import { ref, onValue } from "firebase/database"
import { FaBox, FaFilter, FaSearch, FaChartBar, FaClock } from "react-icons/fa"
import {
  format,
  isToday,
  isYesterday,
  parseISO,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  getHours,
} from "date-fns"
import { ToastContainer } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
  Cell, // Imported Cell
} from "recharts"

interface Product {
  name: string
  price: number
  quantity: number
  lineTotal: number
}

interface SoldProduct {
  id: string
  customerName: string
  customerPhone: string
  discount: number
  paymentMethod: "Online" | "Cash"
  products: Product[]
  timestamp: string
  total: number
}

type FilterType = "all" | "today" | "yesterday" | "customDate" | "customMonth" | "customYear"

interface Summary {
  totalProductsSold: number
}

interface ProductSalesCount {
  name: string
  count: number
  revenue: number
}

interface SalesComparisonData {
  period: string
  totalSales: number
}

interface TimeReportData {
  hour: string
  totalSales: number
}

function MostSell() {
  const [sales, setSales] = useState<SoldProduct[]>([])
  const [filteredSales, setFilteredSales] = useState<SoldProduct[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState<string>("")
  const [filter, setFilter] = useState<FilterType>("all")
  const [customDateRange, setCustomDateRange] = useState<{ start: string; end: string }>({
    start: "",
    end: "",
  })
  const [customMonth, setCustomMonth] = useState<{ month: string; year: string }>({
    month: "",
    year: "",
  })
  const [customYear, setCustomYear] = useState<{ year: string }>({
    year: "",
  })

  // Summary state
  const [summary, setSummary] = useState<Summary>({ totalProductsSold: 0 })

  // Product sales count
  const [productSales, setProductSales] = useState<ProductSalesCount[]>([])

  // Sales Comparison State
  const [salesComparisonFilter, setSalesComparisonFilter] = useState<"week" | "month" | "year">("month")
  const [salesComparisonData, setSalesComparisonData] = useState<SalesComparisonData[]>([])

  // Time Report State
  const [timeReportFilter, setTimeReportFilter] = useState<"day" | "month">("day")
  const [selectedTimePeriod, setSelectedTimePeriod] = useState<string>("") // e.g., '2025-01' or '2025-01-22'
  const [timeReportData, setTimeReportData] = useState<TimeReportData[]>([])

  useEffect(() => {
    const salesRef = ref(database, "sales")
    const unsubscribe = onValue(
      salesRef,
      (snapshot) => {
        const data = snapshot.val()
        if (data) {
          const salesList: SoldProduct[] = Object.keys(data).map((key) => ({
            id: key,
            ...data[key],
          }))

          // **Filter out sales with invalid or missing 'timestamp'**
          const validSalesList = salesList.filter((sale) => {
            if (!sale.timestamp || typeof sale.timestamp !== "string") {
              console.warn(`Sale with ID ${sale.id} is missing a valid 'timestamp' field.`)
              return false
            }
            const parsedDate = Date.parse(sale.timestamp)
            if (isNaN(parsedDate)) {
              console.warn(`Sale with ID ${sale.id} has an invalid 'timestamp' date.`)
              return false
            }
            return true
          })

          // **Sort the validSalesList in descending order based on timestamp**
          validSalesList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

          setSales(validSalesList)
          setFilteredSales(validSalesList)
          calculateSummary(validSalesList)
          aggregateProductSales(validSalesList)
          processSalesComparisonData(validSalesList)
          // Time Report will be processed based on selected filters
        } else {
          setSales([])
          setFilteredSales([])
          setSummary({ totalProductsSold: 0 })
          setProductSales([])
          setSalesComparisonData([])
          setTimeReportData([])
        }
        setLoading(false)
      },
      (error) => {
        console.error("Error fetching sales:", error)
        setError("Failed to fetch sales.")
        setLoading(false)
      },
    )

    // Cleanup subscription on unmount
    return () => unsubscribe()
  }, [])

  // Calculate summary
  const calculateSummary = useCallback((salesList: SoldProduct[]) => {
    let totalProducts = 0
    salesList.forEach((sale) => {
      sale.products.forEach((product) => {
        totalProducts += product.quantity
      })
    })
    setSummary({ totalProductsSold: totalProducts })
  }, [])

  // Aggregate product sales counts
  const aggregateProductSales = useCallback((salesList: SoldProduct[]) => {
    const productMap: { [key: string]: { count: number; revenue: number } } = {}

    salesList.forEach((sale) => {
      sale.products.forEach((product) => {
        if (productMap[product.name]) {
          productMap[product.name].count += product.quantity
          productMap[product.name].revenue += product.lineTotal
        } else {
          productMap[product.name] = { count: product.quantity, revenue: product.lineTotal }
        }
      })
    })

    const aggregated: ProductSalesCount[] = Object.keys(productMap).map((key) => ({
      name: key,
      count: productMap[key].count,
      revenue: productMap[key].revenue,
    }))

    // Sort by count descending
    aggregated.sort((a, b) => b.count - a.count)

    setProductSales(aggregated)
  }, [])

  // Process Sales Comparison Data
  const processSalesComparisonData = useCallback(
    (salesList: SoldProduct[]) => {
      const today = new Date()
      let start: Date
      let end: Date

      if (salesComparisonFilter === "week") {
        start = startOfWeek(today, { weekStartsOn: 1 }) // Monday
        end = endOfWeek(today, { weekStartsOn: 1 })
        // Group by day
        const dataMap: { [key: string]: number } = {}
        for (let i = 0; i < 7; i++) {
          const day = format(new Date(start.getTime() + i * 24 * 60 * 60 * 1000), "EEE")
          dataMap[day] = 0
        }

        salesList.forEach((sale) => {
          const saleDate = parseISO(sale.timestamp)
          if (saleDate >= start && saleDate <= end) {
            const day = format(saleDate, "EEE")
            dataMap[day] += sale.total
          }
        })

        const comparisonData: SalesComparisonData[] = Object.keys(dataMap).map((key) => ({
          period: key,
          totalSales: dataMap[key],
        }))

        setSalesComparisonData(comparisonData)
      } else if (salesComparisonFilter === "month") {
        start = startOfMonth(today)
        end = endOfMonth(today)
        // Group by week
        const weeks: { [key: string]: number } = {}
        const weekCount = Math.ceil((end.getDate() - start.getDate() + 1) / 7)
        for (let i = 1; i <= weekCount; i++) {
          weeks[`Week ${i}`] = 0
        }

        salesList.forEach((sale) => {
          const saleDate = parseISO(sale.timestamp)
          if (saleDate >= start && saleDate <= end) {
            const weekNumber = Math.ceil(saleDate.getDate() / 7)
            weeks[`Week ${weekNumber}`] += sale.total
          }
        })

        const comparisonData: SalesComparisonData[] = Object.keys(weeks).map((key) => ({
          period: key,
          totalSales: weeks[key],
        }))

        setSalesComparisonData(comparisonData)
      } else if (salesComparisonFilter === "year") {
        start = startOfYear(today)
        end = endOfYear(today)
        // Group by month
        const dataMap: { [key: string]: number } = {}
        for (let i = 0; i < 12; i++) {
          const month = format(new Date(0, i), "MMM")
          dataMap[month] = 0
        }

        salesList.forEach((sale) => {
          const saleDate = parseISO(sale.timestamp)
          if (saleDate >= start && saleDate <= end) {
            const month = format(saleDate, "MMM")
            dataMap[month] += sale.total
          }
        })

        const comparisonData: SalesComparisonData[] = Object.keys(dataMap).map((key) => ({
          period: key,
          totalSales: dataMap[key],
        }))

        setSalesComparisonData(comparisonData)
      }
    },
    [salesComparisonFilter],
  )

  // Process Time Report Data
  const processTimeReportData = useCallback(() => {
    let relevantSales = [...filteredSales]

    if (timeReportFilter === "day" && selectedTimePeriod) {
      const selectedDate = parseISO(selectedTimePeriod)
      relevantSales = relevantSales.filter((sale) => {
        const saleDate = parseISO(sale.timestamp)
        return (
          saleDate.getFullYear() === selectedDate.getFullYear() &&
          saleDate.getMonth() === selectedDate.getMonth() &&
          saleDate.getDate() === selectedDate.getDate()
        )
      })
    } else if (timeReportFilter === "month" && selectedTimePeriod) {
      const [year, month] = selectedTimePeriod.split("-").map(Number)
      relevantSales = relevantSales.filter((sale) => {
        const saleDate = parseISO(sale.timestamp)
        return saleDate.getFullYear() === year && saleDate.getMonth() + 1 === month
      })
    }

    // Initialize data for 24 hours
    const dataMap: { [key: number]: number } = {}
    for (let i = 0; i < 24; i++) {
      dataMap[i] = 0
    }

    relevantSales.forEach((sale) => {
      const saleDate = parseISO(sale.timestamp)
      const hour = getHours(saleDate)
      dataMap[hour] += sale.total
    })

    const reportData: TimeReportData[] = Object.keys(dataMap).map((key) => {
      const hour24 = Number.parseInt(key)
      const date = new Date()
      date.setHours(hour24, 0, 0, 0)
      const hour12 = format(date, "h:00 a") // 12-hour format with AM/PM
      return {
        hour: hour12,
        totalSales: dataMap[hour24],
      }
    })

    setTimeReportData(reportData)
  }, [filteredSales, timeReportFilter, selectedTimePeriod])

  useEffect(() => {
    processSalesComparisonData(sales)
  }, [processSalesComparisonData, sales])

  useEffect(() => {
    processTimeReportData()
  }, [processTimeReportData])

  useEffect(() => {
    let tempSales = [...sales]

    // Apply Search Filter
    if (searchTerm.trim() !== "") {
      const lowercasedTerm = searchTerm.toLowerCase()
      tempSales = tempSales.filter(
        (sale) =>
          sale.customerName.toLowerCase().includes(lowercasedTerm) ||
          sale.customerPhone.includes(lowercasedTerm) ||
          sale.products.some(
            (product) =>
              product.name.toLowerCase().includes(lowercasedTerm) || product.price.toString().includes(lowercasedTerm),
          ),
      )
    }

    // Apply Date Filters
    if (filter === "today") {
      tempSales = tempSales.filter((sale) => isToday(parseISO(sale.timestamp)))
    } else if (filter === "yesterday") {
      tempSales = tempSales.filter((sale) => isYesterday(parseISO(sale.timestamp)))
    } else if (filter === "customDate") {
      const { start, end } = customDateRange
      if (start && end) {
        const startDate = new Date(start)
        const endDate = new Date(end)
        tempSales = tempSales.filter((sale) => {
          const saleDate = new Date(sale.timestamp)
          return saleDate >= startDate && saleDate <= endDate
        })
      }
    } else if (filter === "customMonth") {
      const { month, year } = customMonth
      if (month && year) {
        tempSales = tempSales.filter((sale) => {
          const saleDate = new Date(sale.timestamp)
          return saleDate.getMonth() + 1 === Number.parseInt(month) && saleDate.getFullYear() === Number.parseInt(year)
        })
      }
    } else if (filter === "customYear") {
      const { year } = customYear
      if (year) {
        tempSales = tempSales.filter((sale) => {
          const saleDate = new Date(sale.timestamp)
          return saleDate.getFullYear() === Number.parseInt(year)
        })
      }
    }

    setFilteredSales(tempSales)
    calculateSummary(tempSales)
    aggregateProductSales(tempSales)
    processSalesComparisonData(tempSales)
    processTimeReportData()
  }, [
    searchTerm,
    filter,
    customDateRange,
    customMonth,
    customYear,
    sales,
    calculateSummary,
    aggregateProductSales,
    processSalesComparisonData,
    processTimeReportData,
  ])

  const handleFilterChange = (selectedFilter: FilterType) => {
    setFilter(selectedFilter)
    // Reset custom filters when changing the main filter
    if (selectedFilter !== "customDate") {
      setCustomDateRange({ start: "", end: "" })
    }
    if (selectedFilter !== "customMonth") {
      setCustomMonth({ month: "", year: "" })
    }
    if (selectedFilter !== "customYear") {
      setCustomYear({ year: "" })
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="text-center">
          <svg
            className="animate-spin h-12 w-12 text-brand-500 mx-auto mb-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <p className="text-lg text-gray-700 dark:text-gray-300">Loading most sold products...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="text-center">
          <p className="text-red-600 text-lg">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-6 sm:p-8 lg:p-10">
      <ToastContainer />

      <div className="max-w-7xl mx-auto">
        <h2 className="text-4xl font-extrabold text-gray-900 dark:text-white mb-8 text-center">Most Sold Products</h2>

        {/* Summary Card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 flex items-center justify-between mb-10">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Products Sold</p>
            <p className="mt-1 text-3xl font-semibold text-gray-900 dark:text-white">{summary.totalProductsSold}</p>
          </div>
          <FaBox className="text-brand-500 text-6xl" />
        </div>

        {/* Filter Section */}
        <div className="mb-10">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-4 md:space-y-0">
            {/* Filter Buttons */}
            <div className="flex flex-wrap space-x-2">
              <button
                onClick={() => handleFilterChange("all")}
                className={`flex items-center px-4 py-2 border rounded-md text-sm font-medium transition ${
                  filter === "all"
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                <FaFilter className="mr-2" />
                All Time
              </button>
              <button
                onClick={() => handleFilterChange("today")}
                className={`px-4 py-2 border rounded-md text-sm font-medium transition ${
                  filter === "today"
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                Today
              </button>
              <button
                onClick={() => handleFilterChange("yesterday")}
                className={`px-4 py-2 border rounded-md text-sm font-medium transition ${
                  filter === "yesterday"
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                Yesterday
              </button>
              <button
                onClick={() => handleFilterChange("customDate")}
                className={`px-4 py-2 border rounded-md text-sm font-medium transition ${
                  filter === "customDate"
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                Custom Date
              </button>
              <button
                onClick={() => handleFilterChange("customMonth")}
                className={`px-4 py-2 border rounded-md text-sm font-medium transition ${
                  filter === "customMonth"
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                Custom Month
              </button>
              <button
                onClick={() => handleFilterChange("customYear")}
                className={`px-4 py-2 border rounded-md text-sm font-medium transition ${
                  filter === "customYear"
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                Custom Year
              </button>
            </div>

            {/* Search Bar */}
            <div className="relative w-full max-w-md">
              <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
          </div>

          {/* Custom Date Range Picker */}
          {filter === "customDate" && (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col">
                <label htmlFor="startDate" className="text-sm text-gray-700 dark:text-gray-300 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  id="startDate"
                  value={customDateRange.start}
                  onChange={(e) => setCustomDateRange((prev) => ({ ...prev, start: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
              <div className="flex flex-col">
                <label htmlFor="endDate" className="text-sm text-gray-700 dark:text-gray-300 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  id="endDate"
                  value={customDateRange.end}
                  onChange={(e) => setCustomDateRange((prev) => ({ ...prev, end: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
            </div>
          )}

          {/* Custom Month Picker */}
          {filter === "customMonth" && (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col">
                <label htmlFor="month" className="text-sm text-gray-700 dark:text-gray-300 mb-1">
                  Month
                </label>
                <select
                  id="month"
                  value={customMonth.month}
                  onChange={(e) => setCustomMonth((prev) => ({ ...prev, month: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                >
                  <option value="">Select Month</option>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {format(new Date(0, i), "MMMM")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col">
                <label htmlFor="year" className="text-sm text-gray-700 dark:text-gray-300 mb-1">
                  Year
                </label>
                <input
                  type="number"
                  id="year"
                  placeholder="e.g., 2024"
                  value={customMonth.year}
                  onChange={(e) => setCustomMonth((prev) => ({ ...prev, year: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
            </div>
          )}

          {/* Custom Year Picker */}
          {filter === "customYear" && (
            <div className="mt-6 flex flex-col md:flex-row items-start md:items-center space-y-4 md:space-y-0">
              <div className="flex flex-col">
                <label htmlFor="yearOnly" className="text-sm text-gray-700 dark:text-gray-300 mb-1">
                  Year
                </label>
                <input
                  type="number"
                  id="yearOnly"
                  placeholder="e.g., 2024"
                  value={customYear.year}
                  onChange={(e) => setCustomYear({ year: e.target.value })}
                  className="w-full md:w-64 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
            </div>
          )}
        </div>

        {/* Top Products Table */}
        <div className="mb-10 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <h3 className="text-2xl font-semibold text-gray-800 dark:text-gray-100 mb-4">Top Products</h3>
          <div className="overflow-x-auto rounded-lg shadow-lg">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Product Name
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Quantity Sold
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Total Revenue (₹)
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {productSales.map((product, index) => (
                  <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {product.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                      {product.count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                      ₹{product.revenue.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* No Products Found */}
          {productSales.length === 0 && (
            <div className="mt-6 text-center text-gray-600 dark:text-gray-400">
              No products found for the selected filter.
            </div>
          )}
        </div>

        {/* Sales Comparison Report */}
        <div className="mb-10 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Sales Comparison Report</h3>
            <div className="flex space-x-2">
              <button
                onClick={() => setSalesComparisonFilter("week")}
                className={`flex items-center px-3 py-1 border rounded-md text-sm font-medium transition ${
                  salesComparisonFilter === "week"
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setSalesComparisonFilter("month")}
                className={`flex items-center px-3 py-1 border rounded-md text-sm font-medium transition ${
                  salesComparisonFilter === "month"
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"
                }`}
              >
                Month
              </button>
              <button
                onClick={() => setSalesComparisonFilter("year")}
                className={`flex items-center px-3 py-1 border rounded-md text-sm font-medium transition ${
                  salesComparisonFilter === "year"
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"
                }`}
              >
                Year
              </button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={salesComparisonData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" stroke="#8884d8" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="totalSales" fill="#8884d8" name="Total Sales" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Time Report */}
        <div className="mb-10 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Time Report</h3>
            <div className="flex space-x-2">
              <button
                onClick={() => setTimeReportFilter("day")}
                className={`flex items-center px-3 py-1 border rounded-md text-sm font-medium transition ${
                  timeReportFilter === "day"
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"
                }`}
              >
                Day
              </button>
              <button
                onClick={() => setTimeReportFilter("month")}
                className={`flex items-center px-3 py-1 border rounded-md text-sm font-medium transition ${
                  timeReportFilter === "month"
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"
                }`}
              >
                Month
              </button>
            </div>
          </div>

          {/* Time Report Filters */}
          <div className="mb-4 flex flex-col md:flex-row items-start md:items-center space-y-4 md:space-y-0 md:space-x-4">
            {timeReportFilter === "day" && (
              <div className="flex flex-col">
                <label htmlFor="selectDay" className="text-sm text-gray-700 dark:text-gray-300 mb-1">
                  Select Day
                </label>
                <input
                  type="date"
                  id="selectDay"
                  value={selectedTimePeriod}
                  onChange={(e) => setSelectedTimePeriod(e.target.value)}
                  className="w-full md:w-64 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
            )}
            {timeReportFilter === "month" && (
              <div className="flex flex-col">
                <label htmlFor="selectMonth" className="text-sm text-gray-700 dark:text-gray-300 mb-1">
                  Select Month
                </label>
                <input
                  type="month"
                  id="selectMonth"
                  value={selectedTimePeriod}
                  onChange={(e) => setSelectedTimePeriod(e.target.value)}
                  className="w-full md:w-64 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
            )}
          </div>

          {/* Color Legend */}
          <div className="mb-4 flex flex-wrap gap-4">
            <div className="flex items-center">
              <div className="w-4 h-4 rounded bg-red-500 mr-2"></div>
              <span className="text-sm text-gray-600 dark:text-gray-300">High  ₹1000</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded bg-orange-500 mr-2"></div>
              <span className="text-sm text-gray-600 dark:text-gray-300">Moderate ₹500</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded bg-green-500 mr-2"></div>
              <span className="text-sm text-gray-600 dark:text-gray-300">Medium ₹100</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded bg-blue-500 mr-2"></div>
              <span className="text-sm text-gray-600 dark:text-gray-300">Low ₹100</span>
            </div>
          </div>

          {/* Time Report Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {timeReportData.map((entry, index) => {
              let bgColor = "bg-blue-500" // Default Low
              const textColor = "text-white"

              if (entry.totalSales > 1000) {
                bgColor = "bg-red-500" // High
              } else if (entry.totalSales > 500) {
                bgColor = "bg-orange-500" // Moderate
              } else if (entry.totalSales > 100) {
                bgColor = "bg-green-500" // Medium
              }

              return (
                <div
                  key={index}
                  className={`${bgColor} ${textColor} rounded-lg p-4 shadow-md transition-transform hover:scale-105`}
                >
                  <div className="text-lg font-semibold">{entry.hour}</div>
                  <div className="mt-2">₹{entry.totalSales.toLocaleString()}</div>
                </div>
              )
            })}
          </div>

          {/* No Data Message */}
          {timeReportData.length === 0 && (
            <div className="text-center text-gray-500 dark:text-gray-400 mt-4">
              No data available for the selected time period
            </div>
          )}
        </div>

        {/* ... (rest of the code remains the same) */}
      </div>
    </div>
  )
}

export default MostSell

