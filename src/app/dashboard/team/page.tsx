"use client";

import { Plus, Users, Mail, Phone, ShieldCheck } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

export default function TeamPage() {
  const { data, error, isLoading } = useSWR("/api/team", fetcher);
  const team = data?.data || [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">จัดการพนักงาน (Team)</h2>
          <p className="text-gray-500">จัดการรายชื่อพนักงานและสิทธิ์การเข้าถึงระบบ</p>
        </div>
        <Link 
          href="/dashboard/team/new"
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-xl font-medium hover:bg-orange-700 transition"
        >
          <Plus size={20} />
          เพิ่มพนักงาน
        </Link>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100">
          ไม่สามารถดึงข้อมูลพนักงานได้
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-sm border-b border-gray-200">
                <th className="p-4 font-medium">ชื่อ-นามสกุล</th>
                <th className="p-4 font-medium">ตำแหน่ง (Role)</th>
                <th className="p-4 font-medium">อีเมล</th>
                <th className="p-4 font-medium">เบอร์โทรศัพท์</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {team.map((member: any, i: number) => (
                <tr key={i} className="hover:bg-gray-50 transition">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center font-bold">
                        {member.name ? member.name.charAt(0) : <Users size={18} />}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{member.name}</p>
                        <p className="text-xs text-gray-500">ID: {member.member_id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                      <ShieldCheck size={14} />
                      {member.role || "Staff"}
                    </span>
                  </td>
                  <td className="p-4 text-gray-600">
                    <div className="flex items-center gap-2">
                      <Mail size={14} className="text-gray-400" />
                      {member.email || "-"}
                    </div>
                  </td>
                  <td className="p-4 text-gray-600">
                    <div className="flex items-center gap-2">
                      <Phone size={14} className="text-gray-400" />
                      {member.phone || "-"}
                    </div>
                  </td>
                </tr>
              ))}
              {isLoading && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin text-xl">↻</div>
                      กำลังโหลดข้อมูล...
                    </div>
                  </td>
                </tr>
              )}
              {team.length === 0 && !isLoading && !error && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-500">
                    ยังไม่มีข้อมูลพนักงาน
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
