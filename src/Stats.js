import { useEffect, useState } from "react";
import { ref, get } from "firebase/database";
import { realtimeDB } from "./firebase";
import { Bar, Line } from "react-chartjs-2";
import * as XLSX from "xlsx";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

function computeStats(logByDate, activeUsers, startDate, endDate) {
  const stats = {};
  const activeSet = new Set((activeUsers || []).map((u) => u.name));
  const start = new Date(startDate);
  const end = new Date(endDate);

  activeUsers.forEach((u) => {
    stats[u.name] = {
      name: u.name,
      callCount: 0,
      durations: { Molada: 0, "Çalışıyor": 0, Müsait: 0, İzinli: 0 },
    };
  });

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const date = d.toISOString().split("T")[0];
    const logs = logByDate[date] || [];
    const day = new Date(date);
    const workStart = new Date(`${date}T08:30:00`);
    let workEnd = new Date(`${date}T17:30:00`);
    const today = new Date();
    if (day.toDateString() === today.toDateString() && today < workEnd) {
      workEnd = today;
    }
    const sorted = [...logs].sort(
      (a, b) => new Date(`${date}T${a.time}`) - new Date(`${date}T${b.time}`)
    );
    const daily = {};
    activeUsers.forEach((u) => {
      if (activeSet.has(u.name)) {
        daily[u.name] = {
          lastStatus: u.status,
          lastTime: workStart,
          fromDefault: true,
        };
      }
    });
    sorted.forEach((entry) => {
      const person = entry.person;
      if (!activeSet.has(person)) return;
      if (!stats[person])
        stats[person] = {
          name: person,
          callCount: 0,
          durations: { Molada: 0, "Çalışıyor": 0, Müsait: 0, İzinli: 0 },
        };
      const now = new Date(`${date}T${entry.time}`);

      const callMatch = entry.action?.match(/çağrıyı aldı.*: (.*) → Çalışıyor/);
      const statusChangeMatch = entry.action?.match(/Durum: (.*) → (.*)/);
      const anyStatusMatch = entry.action?.match(/(Molada|İzinli|Çalışıyor|Müsait)/);

      const oldStatus = statusChangeMatch
        ? statusChangeMatch[1].trim()
        : callMatch
        ? callMatch[1].trim()
        : anyStatusMatch
        ? anyStatusMatch[1]
        : null;
      const newStatus = statusChangeMatch
        ? statusChangeMatch[2].trim()
        : callMatch
        ? "Çalışıyor"
        : anyStatusMatch
        ? anyStatusMatch[1]
        : null;

      const prev = daily[person];
      if (prev.fromDefault && oldStatus) {
        prev.lastStatus = oldStatus;
        prev.fromDefault = false;
      }
      if (now >= workStart) {
        const periodStart = Math.max(prev.lastTime.getTime(), workStart.getTime());
        const periodEnd = Math.min(now.getTime(), workEnd.getTime());
        const diff = (periodEnd - periodStart) / 60000;
        if (
          diff > 0 &&
          prev.lastStatus &&
          stats[person].durations[prev.lastStatus] !== undefined
        ) {
          stats[person].durations[prev.lastStatus] += diff;
        }
      }

      if (callMatch && now >= workStart && now <= workEnd) {
        stats[person].callCount += 1;
      }

      daily[person] = { lastStatus: newStatus || prev.lastStatus, lastTime: now };
    });
    Object.entries(daily).forEach(([person, data]) => {
      if (!activeSet.has(person)) return;
      const periodStart = Math.max(data.lastTime.getTime(), workStart.getTime());
      const periodEnd = workEnd.getTime();
      const diff = (periodEnd - periodStart) / 60000;
      if (diff > 0 && data.lastStatus && stats[person].durations[data.lastStatus] !== undefined) {
        stats[person].durations[data.lastStatus] += diff;
      }
    });
  }

  return Object.values(stats);
}

function computeHourlyHeatmap(logByDate, startDate, endDate) {
  const heatmap = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split("T")[0];
    const counts = Array(24).fill(0);
    (logByDate[dateStr] || []).forEach((entry) => {
      if (entry.action?.includes("çağrıyı aldı")) {
        const hour = parseInt(entry.time.split(":" )[0], 10);
        if (!isNaN(hour)) counts[hour] += 1;
      }
    });
    heatmap.push({ date: dateStr, counts });
  }
  return heatmap;
}

function computeDailyHeatmap(logByDate, startDate, endDate) {
  const heatmap = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split("T")[0];
    let count = 0;
    (logByDate[dateStr] || []).forEach((entry) => {
      if (entry.action?.includes("çağrıyı aldı")) count += 1;
    });
    heatmap.push({ date: dateStr, count });
  }
  return heatmap;
}

export default function Stats() {
  const [chartStats, setChartStats] = useState([]);
  const [tableStats, setTableStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState({});
  const [activeList, setActiveList] = useState([]);

  const [chartFilter, setChartFilter] = useState("monthly");
  const [chartStartDate, setChartStartDate] = useState("");
  const [chartEndDate, setChartEndDate] = useState("");
  const [chartSelectedDay, setChartSelectedDay] = useState(
    new Date().toISOString().split("T")[0]
  );

  const [tableFilter, setTableFilter] = useState("monthly");
  const [tableStartDate, setTableStartDate] = useState("");
  const [tableEndDate, setTableEndDate] = useState("");
  const [tableSelectedDay, setTableSelectedDay] = useState(
    new Date().toISOString().split("T")[0]
  );

  const [hourlyHeatmap, setHourlyHeatmap] = useState([]);
  const [dailyHeatmap, setDailyHeatmap] = useState([]);
  const [view, setView] = useState("user");

  useEffect(() => {
    const fetchData = async () => {
      const logSnap = await get(ref(realtimeDB, "siraTakip/logByDate"));
      setLogs(logSnap.val() || {});
      const activeSnap = await get(ref(realtimeDB, "siraTakip/activeList"));
      setActiveList(activeSnap.val() || []);
      setLoading(false);
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (loading) return;
    const today = new Date();
    let s = new Date(today);
    let e = new Date(today);
    if (chartFilter === "weekly") {
      s.setDate(e.getDate() - 6);
    } else if (chartFilter === "monthly") {
      s.setDate(e.getDate() - 29);
    } else if (chartFilter === "custom") {
      if (!chartStartDate || !chartEndDate) return;
      s = new Date(chartStartDate);
      e = new Date(chartEndDate);
    } else if (chartFilter === "daily") {
      const d = chartSelectedDay ? new Date(chartSelectedDay) : today;
      s = d;
      e = new Date(d);
    }
    setChartStats(computeStats(logs, activeList, s, e));
    setHourlyHeatmap(computeHourlyHeatmap(logs, s, e));
    setDailyHeatmap(computeDailyHeatmap(logs, s, e));
  }, [logs, activeList, chartFilter, chartStartDate, chartEndDate, chartSelectedDay, loading]);

  useEffect(() => {
    if (loading) return;
    const today = new Date();
    let s = new Date(today);
    let e = new Date(today);
    if (tableFilter === "weekly") {
      s.setDate(e.getDate() - 6);
    } else if (tableFilter === "monthly") {
      s.setDate(e.getDate() - 29);
    } else if (tableFilter === "custom") {
      if (!tableStartDate || !tableEndDate) return;
      s = new Date(tableStartDate);
      e = new Date(tableEndDate);
    } else if (tableFilter === "daily") {
      const d = tableSelectedDay ? new Date(tableSelectedDay) : today;
      s = d;
      e = new Date(d);
    }
    setTableStats(computeStats(logs, activeList, s, e));
  }, [logs, activeList, tableFilter, tableStartDate, tableEndDate, tableSelectedDay, loading]);

  if (loading) return <div className="p-4">Yükleniyor...</div>;

  let titleRange = "";
  if (chartFilter === "daily") titleRange = "Bugün";
  else if (chartFilter === "weekly") titleRange = "Son 7 Gün";
  else if (chartFilter === "monthly") titleRange = "Son 30 Gün";
  else if (chartFilter === "custom" && chartStartDate && chartEndDate)
    titleRange = `${chartStartDate} - ${chartEndDate}`;

  const chartData = {
    labels: chartStats.map((d) => d.name),
    datasets: [
      {
        label: "Çağrı Sayısı",
        data: chartStats.map((d) => d.callCount),
        backgroundColor: "rgba(75, 192, 192, 0.5)",
      },
    ],
  };

  const dailyLineData = {
    labels: dailyHeatmap.map((h) => h.date),
    datasets: [
      {
        label: "Günlük Toplam Çağrı",
        data: dailyHeatmap.map((h) => h.count),
        borderColor: "rgb(75, 192, 192)",
        fill: false,
        tension: 0.1,
      },
    ],
  };


  const exportExcel = () => {
    const wsData = [];
    const header = ["Tarih"];
    for (let h = 8; h <= 18; h++) {
      header.push(h.toString().padStart(2, "0"));
    }
    wsData.push(header);
    hourlyHeatmap.forEach((row) => {
      const rowData = [row.date];
      for (let h = 8; h <= 18; h++) {
        rowData.push(row.counts[h] || 0);
      }
      wsData.push(rowData);
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Heatmap");
    XLSX.writeFile(wb, "heatmap.xlsx");
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-6xl mx-auto bg-white shadow-md rounded-lg p-6">
        <h2 className="text-2xl font-semibold text-gray-700 mb-4">Kullanıcı İstatistikleri {titleRange && `(${titleRange})`}</h2>
        <div className="flex items-center gap-2 mb-4">
          <select
            className="border rounded p-2"
            value={chartFilter}
            onChange={(e) => setChartFilter(e.target.value)}
          >
            <option value="daily">Günlük</option>
            <option value="weekly">Haftalık</option>
            <option value="monthly">Aylık</option>
            <option value="custom">Özel</option>
          </select>
          {chartFilter === "daily" && (
            <input
              type="date"
              className="border rounded p-2"
              value={chartSelectedDay}
              onChange={(e) => setChartSelectedDay(e.target.value)}
            />
          )}
          {chartFilter === "custom" && (
            <>
              <input
                type="date"
                className="border rounded p-2"
                value={chartStartDate}
                onChange={(e) => setChartStartDate(e.target.value)}
              />
              <input
                type="date"
                className="border rounded p-2"
                value={chartEndDate}
                onChange={(e) => setChartEndDate(e.target.value)}
              />
            </>
          )}
          <select
            className="border rounded p-2 ml-auto"
            value={view}
            onChange={(e) => setView(e.target.value)}
          >
            <option value="user">Çağrı Sayısı</option>
            <option value="total">Toplam Çağrı</option>
          </select>
        </div>
        <div className="mb-8">
          {view === "user" ? (
            <Bar data={chartData} />
          ) : (
            <Line data={dailyLineData} />
          )}
        </div>
        <div className="mb-8">
          <button
            onClick={exportExcel}
            className="px-2 py-1 border rounded"
          >
            Excel İndir
          </button>
        </div>
        <div className="flex items-center gap-2 mb-4">
          <select
            className="border rounded p-2"
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
          >
            <option value="daily">Günlük</option>
            <option value="weekly">Haftalık</option>
            <option value="monthly">Aylık</option>
            <option value="custom">Özel</option>
          </select>
          {tableFilter === "daily" && (
            <input
              type="date"
              className="border rounded p-2"
              value={tableSelectedDay}
              onChange={(e) => setTableSelectedDay(e.target.value)}
            />
          )}
          {tableFilter === "custom" && (
            <>
              <input
                type="date"
                className="border rounded p-2"
                value={tableStartDate}
                onChange={(e) => setTableStartDate(e.target.value)}
              />
              <input
                type="date"
                className="border rounded p-2"
                value={tableEndDate}
                onChange={(e) => setTableEndDate(e.target.value)}
              />
            </>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border border-gray-200 rounded-lg">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="px-3 py-2 text-left border-b">Kullanıcı</th>
                <th className="px-3 py-2 text-left border-b">Mola Süresi (dk)</th>
                <th className="px-3 py-2 text-left border-b">Çalışma Süresi (dk)</th>
                <th className="px-3 py-2 text-left border-b">Müsait Süresi (dk)</th>
                <th className="px-3 py-2 text-left border-b">Çağrı Sayısı</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {tableStats.map((d) => (
                <tr key={d.name} className="hover:bg-gray-50">
                  <td className="p-2 border">{d.name}</td>
                  <td className="p-2 border">{Math.round(d.durations.Molada)}</td>
                  <td className="p-2 border">{Math.round(d.durations["Çalışıyor"])} </td>
                  <td className="p-2 border">{Math.round(d.durations.Müsait)}</td>
                  <td className="p-2 border">{d.callCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
