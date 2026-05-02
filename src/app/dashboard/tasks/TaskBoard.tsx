"use client";

import { useState, useEffect } from "react";
import { Plus, MoreHorizontal, Clock, CalendarDays, User } from "lucide-react";

const COLUMNS = ["To Do", "In Progress", "Review", "Done"];

const STATUS_COLORS: Record<string, string> = {
  "To Do": "bg-gray-100 text-gray-700",
  "In Progress": "bg-blue-100 text-blue-700",
  "Review": "bg-orange-100 text-orange-700",
  "Done": "bg-green-100 text-green-700"
};

export default function TaskBoard({ projects, team }: { projects: any[], team: any[] }) {
  const [selectedProject, setSelectedProject] = useState(projects[0]?.project_id || "");
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Drag state
  const [draggedTask, setDraggedTask] = useState<any | null>(null);

  // New task modal state
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [newTaskEnd, setNewTaskEnd] = useState("");

  useEffect(() => {
    if (selectedProject) {
      fetchTasks(selectedProject);
    }
  }, [selectedProject]);

  const fetchTasks = async (projectId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks?project_id=${projectId}`);
      if (res.ok) {
        const json = await res.json();
        setTasks(json.data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, task: any) => {
    setDraggedTask(task);
    // Needed for Firefox
    e.dataTransfer.setData("text/plain", task.task_id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, status: string) => {
    e.preventDefault();
    if (!draggedTask) return;
    if (draggedTask.status === status) return;

    // Optimistic UI update
    const previousTasks = [...tasks];
    setTasks(prev => prev.map(t => t.task_id === draggedTask.task_id ? { ...t, status } : t));
    
    // Background API call
    try {
      const res = await fetch("/api/tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _rowIndex: draggedTask._rowIndex,
          status
        })
      });
      if (!res.ok) throw new Error("Failed to update status");
    } catch (err) {
      console.error(err);
      // Revert on failure
      setTasks(previousTasks);
      alert("ไม่สามารถบันทึกการเปลี่ยนแปลงได้ โปรดลองอีกครั้ง");
    }
    setDraggedTask(null);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName) return;

    const newTask = {
      project_id: selectedProject,
      name: newTaskName,
      assignee: newTaskAssignee,
      end: newTaskEnd,
      status: "To Do"
    };

    // Optimistic insert (temporary ID)
    const tempTask = { ...newTask, task_id: `temp-${Date.now()}` };
    setTasks(prev => [...prev, tempTask]);
    setShowNewTask(false);
    setNewTaskName("");
    setNewTaskAssignee("");
    setNewTaskEnd("");

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTask)
      });
      if (res.ok) {
        // Refetch to get real _rowIndex and ID
        fetchTasks(selectedProject);
      }
    } catch (err) {
      console.error(err);
      fetchTasks(selectedProject); // Revert on fail
    }
  };

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden">
      <div className="flex items-center justify-between mb-6 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <label className="font-medium text-gray-700">โครงการ:</label>
          <select 
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-200 min-w-[250px]"
          >
            {projects.map(p => (
              <option key={p.project_id} value={p.project_id}>{p.project_id} - {p.name}</option>
            ))}
          </select>
        </div>
        
        <button 
          onClick={() => setShowNewTask(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition text-sm font-medium"
        >
          <Plus size={16} />
          เพิ่มงานใหม่
        </button>
      </div>

      {loading && tasks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="animate-spin text-2xl mr-3">↻</div>
          กำลังโหลด...
        </div>
      ) : (
        <div className="flex-1 flex gap-6 overflow-x-auto pb-4 custom-scrollbar">
          {COLUMNS.map(col => {
            const columnTasks = tasks.filter(t => t.status === col);
            return (
              <div 
                key={col} 
                className="flex-shrink-0 w-80 flex flex-col bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, col)}
              >
                <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-white">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[col].split(' ')[0].replace('100', '500')}`}></span>
                    <h3 className="font-semibold text-gray-800">{col}</h3>
                  </div>
                  <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                    {columnTasks.length}
                  </span>
                </div>
                
                <div className="p-3 flex-1 overflow-y-auto space-y-3">
                  {columnTasks.map(task => (
                    <div 
                      key={task.task_id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task)}
                      className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 cursor-grab active:cursor-grabbing hover:border-orange-300 transition-colors group"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${STATUS_COLORS[col]}`}>
                          {task.task_id}
                        </span>
                        <button className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-gray-700">
                          <MoreHorizontal size={16} />
                        </button>
                      </div>
                      
                      <h4 className="text-sm font-semibold text-gray-900 mb-3 line-clamp-2">
                        {task.name}
                      </h4>
                      
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        {task.end ? (
                          <div className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
                            <CalendarDays size={12} className="text-gray-400" />
                            {task.end}
                          </div>
                        ) : (
                          <div></div>
                        )}
                        
                        {task.assignee && (
                          <div className="flex items-center gap-1.5" title={task.assignee}>
                            <div className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center font-bold text-[9px]">
                              {task.assignee.charAt(0)}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {columnTasks.length === 0 && (
                    <div className="h-24 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center text-gray-400 text-sm">
                      ลากการ์ดมาวางที่นี่
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Task Modal */}
      {showNewTask && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">เพิ่มงานใหม่</h3>
              <button onClick={() => setShowNewTask(false)} className="text-gray-400 hover:text-gray-700">
                &times;
              </button>
            </div>
            <form onSubmit={handleCreateTask} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่องาน <span className="text-red-500">*</span></label>
                <input 
                  autoFocus
                  required
                  value={newTaskName}
                  onChange={e => setNewTaskName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-200 outline-none transition"
                  placeholder="เช่น เทคอนกรีตคานชั้น 1"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ผู้รับผิดชอบ</label>
                  <select 
                    value={newTaskAssignee}
                    onChange={e => setNewTaskAssignee(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-200 outline-none transition bg-white"
                  >
                    <option value="">-- ไม่ระบุ --</option>
                    {team.map(member => (
                      <option key={member.member_id} value={member.name}>{member.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">กำหนดส่ง</label>
                  <input 
                    type="date"
                    value={newTaskEnd}
                    onChange={e => setNewTaskEnd(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-200 outline-none transition"
                  />
                </div>
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setShowNewTask(false)}
                  className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition"
                >
                  ยกเลิก
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-orange-600 text-white font-medium rounded-lg hover:bg-orange-700 transition"
                >
                  เพิ่มงาน
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
