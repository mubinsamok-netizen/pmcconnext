"use client";

import { Plus, Package, Truck, Clock, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { useState } from "react";

const STATUS_STYLES: Record<string, string> = {
  "Pending": "bg-orange-50 text-orange-700 border-orange-200",
  "Ordered": "bg-blue-50 text-blue-700 border-blue-200",
  "Delivered": "bg-green-50 text-green-700 border-green-200"
};

const STATUS_ICONS: Record<string, any> = {
  "Pending": <Clock size={14} className="text-orange-500" />,
  "Ordered": <Truck size={14} className="text-blue-500" />,
  "Delivered": <CheckCircle2 size={14} className="text-green-500" />
};

export default function MaterialsPage() {
  const searchParams = useSearchParams();
  const [selectedProject, setSelectedProject] = useState(searchParams.get("project_id") || "");
  const materialKey = selectedProject ? `/api/materials?project_id=${selectedProject}` : "/api/materials";
  const { data: materialsData, error, isLoading } = useSWR(materialKey, fetcher);
  const { data: projectsData } = useSWR("/api/projects?mode=basic", fetcher);
  
  const materials = materialsData?.data || [];
  const projects = projectsData?.data || [];

  const filteredMaterials = selectedProject 
    ? materials.filter((m: any) => m.project_id === selectedProject) 
    : materials;

  const totalCost = filteredMaterials.reduce((sum: number, m: any) => sum + (parseFloat(m.cost) || 0), 0);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">วัสดุ & งบประมาณ</h2>
          <p className="text-gray-500">จัดการการสั่งซื้อวัสดุก่อสร้าง และติดตามงบประมาณ</p>
        </div>
        <Link 
          href="/dashboard/materials/new"
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-xl font-medium hover:bg-orange-700 transition"
        >
          <Plus size={20} />
          บันทึกสั่งซื้อวัสดุ
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600">
            <Package size={28} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">ยอดรวมค่าวัสดุ (บาท)</p>
            <p className="text-2xl font-bold text-gray-900">
              ฿{totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4 md:col-span-2">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">กรองตามโครงการ</label>
            <select 
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-200 transition"
            >
              <option value="">ทั้งหมด (All Projects)</option>
              {projects.map((p: any) => (
                <option key={p.project_id} value={p.project_id}>{p.project_id} - {p.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100">
          ไม่สามารถดึงข้อมูลรายการสั่งซื้อได้
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-sm border-b border-gray-200 whitespace-nowrap">
                <th className="p-4 font-medium">รายการ / รหัส</th>
                <th className="p-4 font-medium">โครงการ</th>
                <th className="p-4 font-medium">ร้านค้า (Supplier)</th>
                <th className="p-4 font-medium text-right">จำนวน</th>
                <th className="p-4 font-medium text-right">ราคารวม (บาท)</th>
                <th className="p-4 font-medium">วันที่สั่ง / กำหนดส่ง</th>
                <th className="p-4 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {filteredMaterials.map((item: any, i: number) => (
                <tr key={i} className="hover:bg-gray-50 transition">
                  <td className="p-4">
                    <p className="font-semibold text-gray-900 line-clamp-1">{item.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{item.material_id}</p>
                  </td>
                  <td className="p-4 text-gray-600 font-medium">
                    {item.project_id}
                  </td>
                  <td className="p-4 text-gray-600 truncate max-w-[150px]">
                    {item.supplier || "-"}
                  </td>
                  <td className="p-4 text-gray-900 text-right font-medium">
                    {item.quantity} <span className="text-gray-500 font-normal text-xs">{item.unit}</span>
                  </td>
                  <td className="p-4 text-gray-900 font-semibold text-right">
                    {parseFloat(item.cost || 0).toLocaleString()}
                  </td>
                  <td className="p-4">
                    <div className="text-xs text-gray-500 space-y-1">
                      <p><span className="text-gray-400 w-12 inline-block">สั่งซื้อ:</span> {item.order_date || "-"}</p>
                      <p><span className="text-gray-400 w-12 inline-block">ส่ง:</span> {item.delivery_date || "-"}</p>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_STYLES[item.status] || STATUS_STYLES.Pending}`}>
                      {STATUS_ICONS[item.status] || STATUS_ICONS.Pending}
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
              
              {isLoading && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin text-xl">↻</div>
                      กำลังโหลดข้อมูล...
                    </div>
                  </td>
                </tr>
              )}
              
              {filteredMaterials.length === 0 && !isLoading && !error && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">
                    ยังไม่มีรายการสั่งซื้อวัสดุในระบบ
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
