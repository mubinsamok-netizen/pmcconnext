"use client";

import { useMemo, useState } from "react";
import { Edit3, Plus, Users, Mail, Phone, ShieldCheck, MapPin, Filter } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { getAppRole } from "@/lib/roles";

type Project = {
  project_id: string;
  name: string;
};

type TeamMember = {
  _rowIndex?: number;
  member_id: string;
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  project_ids?: string;
};

type ApiResponse<T> = {
  success: boolean;
  data: T[];
};

export default function TeamPage() {
  const [roleFilter, setRoleFilter] = useState("all");
  const { data, error, isLoading } = useSWR<ApiResponse<TeamMember>>("/api/team", fetcher);
  const { data: projectsData } = useSWR<ApiResponse<Project>>("/api/projects?mode=basic", fetcher);
  const team = useMemo(() => data?.data || [], [data?.data]);
  const projects = useMemo(() => projectsData?.data || [], [projectsData?.data]);
  const projectMap = useMemo(() => new Map(projects.map((project) => [project.project_id, project.name])), [projects]);
  const roleCounts = useMemo(() => {
    return team.reduce<Record<string, number>>((counts, member) => {
      const role = getAppRole(member.role);
      counts[role] = (counts[role] || 0) + 1;
      return counts;
    }, {});
  }, [team]);
  const roleOptions = useMemo(() => Object.keys(roleCounts).sort(), [roleCounts]);
  const filteredTeam = useMemo(() => {
    if (roleFilter === "all") return team;
    return team.filter((member) => getAppRole(member.role) === roleFilter);
  }, [roleFilter, team]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">จัดการพนักงาน (Team)</h2>
          <p className="text-gray-500">รายชื่อพนักงานและสิทธิ์เข้าถึงไซต์งาน เก็บใน Master Sheet</p>
        </div>
        <Link
          href="/dashboard/team/new"
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-xl font-medium hover:bg-orange-700 transition"
        >
          <Plus size={20} />
          เพิ่มพนักงาน
        </Link>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-50 text-orange-600">
              <Filter size={18} />
            </span>
            <div>
              <h3 className="font-bold text-gray-900">กรองตาม Role</h3>
              <p className="text-sm text-gray-500">
                แสดง {filteredTeam.length} จาก {team.length} คน
              </p>
            </div>
          </div>
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            className="h-11 min-w-56 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
          >
            <option value="all">ทุก Role ({team.length})</option>
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {role} ({roleCounts[role] || 0})
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100">
          ไม่สามารถดึงข้อมูลพนักงานจาก Master Sheet ได้
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
                <th className="p-4 font-medium">ไซต์ที่เข้าถึงได้</th>
                <th className="p-4 font-medium text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {filteredTeam.map((member) => {
                const memberProjects = (member.project_ids || "").split(",").filter(Boolean);
                const isAdmin = getAppRole(member.role) === "Admin";

                return (
                  <tr key={member.member_id} className="hover:bg-gray-50 transition">
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
                    <td className="p-4 text-gray-600">
                      <div className="flex flex-wrap gap-1.5">
                        {isAdmin ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                            <ShieldCheck size={12} />
                            ทุกไซต์
                          </span>
                        ) : memberProjects.length ? memberProjects.map((projectId) => (
                          <span key={projectId} className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700">
                            <MapPin size={12} />
                            {projectMap.get(projectId) || projectId}
                          </span>
                        )) : <span className="text-gray-400">ยังไม่กำหนดไซต์</span>}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-center">
                        <Link
                          href={`/dashboard/team/${member.member_id}/edit`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-orange-50 hover:text-orange-600"
                          title="แก้ไขพนักงาน"
                        >
                          <Edit3 size={16} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {isLoading && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin text-xl">↻</div>
                      กำลังโหลดข้อมูลจาก Master Sheet...
                    </div>
                  </td>
                </tr>
              )}
              {filteredTeam.length === 0 && !isLoading && !error && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    {team.length === 0 ? "ยังไม่มีข้อมูลพนักงานใน Master Sheet" : "ไม่มีพนักงานใน Role ที่เลือก"}
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
