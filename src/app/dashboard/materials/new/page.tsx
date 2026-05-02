"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, ShoppingCart } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

export default function NewMaterialPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: projectsData } = useSWR("/api/projects", fetcher);
  const projects = projectsData?.data || [];

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const data = {
      project_id: formData.get("project_id"),
      name: formData.get("name"),
      supplier: formData.get("supplier"),
      quantity: formData.get("quantity"),
      unit: formData.get("unit"),
      cost: formData.get("cost"),
      order_date: formData.get("order_date"),
      delivery_date: formData.get("delivery_date"),
      status: formData.get("status"),
    };

    try {
      const res = await fetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to save material order");
      }

      router.push("/dashboard/materials");
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link 
          href="/dashboard/materials"
          className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
        >
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">บันทึกการสั่งซื้อวัสดุ</h2>
          <p className="text-gray-500">เก็บประวัติการจัดซื้อและติดตามสถานะการจัดส่ง</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100 text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                โครงการ <span className="text-orange-500">*</span>
              </label>
              <select 
                name="project_id"
                required
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-200 focus:border-orange-400 outline-none transition"
              >
                <option value="">-- เลือกโครงการ --</option>
                {projects.map((p: any) => (
                  <option key={p.project_id} value={p.project_id}>{p.project_id} - {p.name}</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ชื่อรายการวัสดุ <span className="text-orange-500">*</span>
              </label>
              <input 
                name="name"
                required
                placeholder="เช่น ปูนซีเมนต์ปอร์ตแลนด์, เหล็กเส้น DB12"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-200 focus:border-orange-400 outline-none transition"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ร้านค้า / Supplier
              </label>
              <input 
                name="supplier"
                placeholder="เช่น ไทวัสดุ, SCG, โกลบอลเฮ้าส์"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-200 focus:border-orange-400 outline-none transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                จำนวน
              </label>
              <input 
                name="quantity"
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-200 focus:border-orange-400 outline-none transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                หน่วย
              </label>
              <input 
                name="unit"
                placeholder="เช่น ถุง, ตัน, เส้น, คิว"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-200 focus:border-orange-400 outline-none transition"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ราคารวมทั้งหมด (บาท)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-3.5 text-gray-500 font-medium">฿</span>
                <input 
                  name="cost"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-200 focus:border-orange-400 outline-none transition font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                วันที่สั่งซื้อ
              </label>
              <input 
                type="date"
                name="order_date"
                defaultValue={new Date().toISOString().split('T')[0]}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-200 focus:border-orange-400 outline-none transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                กำหนดส่ง
              </label>
              <input 
                type="date"
                name="delivery_date"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-200 focus:border-orange-400 outline-none transition"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                สถานะ <span className="text-orange-500">*</span>
              </label>
              <select 
                name="status"
                required
                defaultValue="Pending"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-200 focus:border-orange-400 outline-none transition"
              >
                <option value="Pending">รอสั่งซื้อ (Pending)</option>
                <option value="Ordered">สั่งซื้อแล้ว (Ordered)</option>
                <option value="Delivered">จัดส่งแล้ว (Delivered)</option>
              </select>
            </div>
          </div>

          <div className="pt-6 border-t border-gray-100 flex justify-end gap-3">
            <Link 
              href="/dashboard/materials"
              className="px-6 py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition"
            >
              ยกเลิก
            </Link>
            <button 
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-6 py-3 bg-orange-600 text-white font-medium rounded-xl hover:bg-orange-700 transition disabled:opacity-70"
            >
              <ShoppingCart size={20} />
              {loading ? "กำลังบันทึก..." : "บันทึกการสั่งซื้อ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
