export type QcChecklistRecord = Record<string, string | number | undefined> & {
  _rowIndex?: number;
  qc_id: string;
  project_id: string;
  template_id?: string;
  document_no?: string;
  category?: string;
  phase?: string;
  title?: string;
  status?: string;
  approval_status?: string;
  inspection_date?: string;
  inspected_by_name?: string;
  inspected_by_email?: string;
  customer_approved_at?: string;
  customer_approved_by?: string;
  customer_approval_note?: string;
  approval_token?: string;
  approval_url?: string;
  items_json?: string;
  evidence_files_json?: string;
  pdf_file_id?: string;
  pdf_url?: string;
  line_group_id?: string;
  line_message?: string;
  sent_to_customer_at?: string;
  issued_at?: string;
  issued_by_name?: string;
  issued_by_email?: string;
  notes?: string;
  active?: string;
  created_at?: string;
  updated_at?: string;
};

export type QcChecklistItem = {
  item_id: string;
  section: string;
  title: string;
  acceptance: string;
  result: "pending" | "pass" | "fail" | "repair";
  notes?: string;
};

export type QcEvidenceFile = {
  file_id: string;
  file_name: string;
  file_url: string;
  mime_type: string;
  data_url?: string;
};

export type QcUploadPayload = {
  name?: string;
  type?: string;
  dataUrl?: string;
};

export const QC_STATUSES = [
  "draft",
  "in_progress",
  "ready_for_customer",
  "sent_to_customer",
  "customer_approved",
  "needs_rework",
] as const;

export const QC_RESULT_LABELS: Record<string, string> = {
  pending: "ยังไม่ตรวจ",
  pass: "ผ่าน",
  fail: "ไม่ผ่าน",
  repair: "ต้องแก้ไข",
};

export const QC_STATUS_LABELS: Record<string, string> = {
  draft: "ร่าง",
  in_progress: "กำลังตรวจ",
  ready_for_customer: "พร้อมส่งอนุมัติ",
  sent_to_customer: "ส่งให้ลูกค้าแล้ว",
  customer_approved: "ลูกค้าอนุมัติแล้ว",
  needs_rework: "ต้องแก้ไข",
};

export const QC_APPROVAL_LABELS: Record<string, string> = {
  not_sent: "ยังไม่ส่ง",
  pending: "รอลูกค้าอนุมัติ",
  approved: "ลูกค้าอนุมัติแล้ว",
  rejected: "ไม่อนุมัติ/ต้องแก้ไข",
};

export const QC_TEMPLATES = [
  {
    "template_id": "qc-structure-piling",
    "category": "โครงสร้าง",
    "phase": "งานเสาเข็มตอก",
    "title": "ตรวจงานเสาเข็มตอก",
    "items": [
      [
        "ก่อนตอกเข็ม",
        "สเปกเสาเข็ม ขนาด รูปร่าง ความยาว และจำนวนตรงตามแบบ",
        "ตรวจเอกสารสั่งซื้อ/แบบก่อสร้างและตรวจนับหน้างาน"
      ],
      [
        "ก่อนตอกเข็ม",
        "สภาพเสาเข็มไม่โก่ง ร้าว แตก หัก หรือบิ่นเสียหาย",
        "คัดแยกเสาเข็มที่เสียหายก่อนใช้งาน"
      ],
      [
        "ก่อนตอกเข็ม",
        "อายุคอนกรีตเสาเข็มครบตามกำหนดจากวันหล่อ",
        "ตรวจใบส่งของหรือเอกสารรับรองอายุคอนกรีต"
      ],
      [
        "ก่อนตอกเข็ม",
        "ปั้นจั่น ลูกตุ้ม หมวกครอบเข็ม และอุปกรณ์ตอกเหมาะสม",
        "อุปกรณ์พร้อมใช้งานและปลอดภัย"
      ],
      [
        "ขณะตอกและหลังตอก",
        "ตำแหน่งหมุดเสาเข็มและระยะออฟเซ็ตตรงตามแบบ",
        "ตรวจแนวศูนย์ก่อนตอกและหลังตอก"
      ],
      [
        "ขณะตอกและหลังตอก",
        "แนวดิ่งเสาเข็มถูกต้องทั้งด้านหน้าและด้านข้าง",
        "ควบคุมแนวดิ่งระหว่างตอกไม่ให้เอียงเกินค่าที่ยอมรับได้"
      ],
      [
        "ขณะตอกและหลังตอก",
        "ระยะยก ปล่อยลูกตุ้ม จำนวน blow และ final set ถูกต้อง",
        "บันทึกข้อมูลการตอกครบและให้วิศวกรยืนยันก่อนหยุดตอก"
      ],
      [
        "ขณะตอกและหลังตอก",
        "รอยต่อท่อนเข็มเชื่อมเต็มรอบและได้แนว",
        "รอยเชื่อมต่อเนื่อง แข็งแรง ไม่มีรูพรุน"
      ],
      [
        "ขณะตอกและหลังตอก",
        "หัวเข็มและสภาพเข็มหลังตอกไม่แตกร้าวเสียหาย",
        "ไม่มีความเสียหายที่กระทบกำลังรับน้ำหนัก"
      ],
      [
        "ความปลอดภัย",
        "พื้นที่ตอกเข็มกั้นเขตและควบคุมคนเข้าออก",
        "มีเขตกั้น ป้ายเตือน และผู้ควบคุมงานระหว่างปั้นจั่นทำงาน"
      ]
    ]
  },
  {
    "template_id": "qc-structure-bored-pile",
    "category": "โครงสร้าง",
    "phase": "งานเสาเข็มเจาะ",
    "title": "ตรวจงานเสาเข็มเจาะ",
    "items": [
      [
        "ก่อนเจาะ",
        "ตำแหน่งหมุดเสาเข็ม ขนาดเสาเข็ม และระยะออฟเซ็ตตรงตามแบบ",
        "ตรวจแนวศูนย์ ระยะอ้างอิง และเลขที่เข็มก่อนเริ่มเจาะ"
      ],
      [
        "ก่อนเจาะ",
        "เครื่องเจาะ ปลอกเหล็กชั่วคราว และอุปกรณ์ยกพร้อมใช้งาน",
        "อุปกรณ์อยู่ในสภาพปลอดภัย เหมาะกับขนาดและความลึกของเข็ม"
      ],
      [
        "ก่อนเจาะ",
        "พื้นที่ทำงานมั่นคงและมีมาตรการป้องกันดินพัง/หลุมเปิด",
        "จัดพื้นที่ปลอดภัย มีแนวกั้น ป้ายเตือน และทางเดินเครื่องจักรชัดเจน"
      ],
      [
        "ระหว่างเจาะ",
        "แนวดิ่งของหลุมเจาะอยู่ในค่าที่ยอมรับได้",
        "ควบคุมแนวเจาะและตรวจความเอียงระหว่างทำงาน"
      ],
      [
        "ระหว่างเจาะ",
        "ขนาดเส้นผ่านศูนย์กลางและความลึกของหลุมเจาะตรงตามแบบ",
        "วัดความลึกจริงและบันทึกข้อมูลก่อนลงเหล็ก"
      ],
      [
        "ระหว่างเจาะ",
        "ระดับน้ำหรือ slurry ในหลุมเจาะเหมาะสม ป้องกันผนังหลุมพัง",
        "ควบคุมระดับและสภาพน้ำ/slurry ตลอดช่วงเจาะจนถึงเทคอนกรีต"
      ],
      [
        "ก่อนลงเหล็ก",
        "ทำความสะอาดก้นหลุม ไม่มีตะกอน ดินเลน หรือเศษวัสดุมากเกินกำหนด",
        "ตรวจความสะอาดก้นหลุมก่อนหย่อน cage เหล็ก"
      ],
      [
        "เหล็กเสริม",
        "cage เหล็ก ชนิด ขนาด จำนวน ความยาว และเหล็กปลอกตรงตามแบบ",
        "ตรวจนับเหล็ก ระยะปลอก และความยาว cage ก่อนยกลงหลุม"
      ],
      [
        "เหล็กเสริม",
        "ระยะหุ้มคอนกรีตและ spacer รอบ cage เพียงพอ",
        "ติดตั้ง spacer ครบเพื่อให้ cage อยู่กึ่งกลางหลุม"
      ],
      [
        "เหล็กเสริม",
        "รอยต่อ cage เหล็ก เชื่อมหรือผูกต่อแข็งแรงและได้แนว",
        "รอยต่อไม่หลุด ไม่บิด และไม่ทำให้ cage เสียรูปขณะหย่อนลงหลุม"
      ],
      [
        "ก่อนเทคอนกรีต",
        "ท่อ tremie สะอาด ยาวถึงระดับที่กำหนด และประกอบแน่น",
        "ปลายท่อ tremie อยู่ในตำแหน่งเหมาะสมก่อนเริ่มเท"
      ],
      [
        "เทคอนกรีต",
        "สเปกคอนกรีต กำลังอัด slump และเวลาขนส่งถูกต้อง",
        "ตรวจใบส่งคอนกรีตและทดสอบ slump ทุกคันตามแผนควบคุมคุณภาพ"
      ],
      [
        "เทคอนกรีต",
        "เทคอนกรีตต่อเนื่องด้วย tremie และปลายท่อจมในคอนกรีตตลอดเวลา",
        "ลดความเสี่ยงคอนกรีตแยกตัวหรือมีดิน/slurry ปน"
      ],
      [
        "เทคอนกรีต",
        "ปริมาณคอนกรีตที่เทจริงสัมพันธ์กับปริมาตรหลุมเจาะ",
        "บันทึกปริมาณคอนกรีตจริงและตรวจความผิดปกติของปริมาตร"
      ],
      [
        "หลังเท",
        "ระดับหัวเข็มหลังเทสูงพอสำหรับสกัดหัวเข็มและต่อฐานราก",
        "ตรวจระดับหัวเข็มและบันทึกก่อนปล่อยงานถัดไป"
      ],
      [
        "เอกสารและบันทึก",
        "บันทึก pile record ครบถ้วน",
        "มีข้อมูลเลขที่เข็ม ความลึก เวลาเริ่ม-จบ ปริมาณคอนกรีต slump และผู้ตรวจ"
      ]
    ]
  },
  {
    "template_id": "qc-structure-foundation",
    "category": "โครงสร้าง",
    "phase": "งานฐานราก",
    "title": "ตรวจงานฐานราก",
    "items": [
      [
        "ขุดดินและคอนกรีตหยาบ",
        "ขนาดหลุม ระดับ ความลึก และตำแหน่งฐานรากตรงตามแบบ",
        "ตรวจแนวศูนย์ ระดับก้นหลุม และขนาดหลุมก่อนเทคอนกรีตหยาบ"
      ],
      [
        "ขุดดินและคอนกรีตหยาบ",
        "ก้นหลุมแน่น ไม่มีดินอ่อน น้ำขัง หรือเศษวัสดุ",
        "ปรับแต่งก้นหลุมและสูบน้ำออกก่อนเท"
      ],
      [
        "ขุดดินและคอนกรีตหยาบ",
        "คอนกรีตหยาบได้ระดับ ความหนา และผิวเรียบร้อย",
        "พร้อมสำหรับวางเหล็กและเข้าแบบ"
      ],
      [
        "วางเหล็กและเข้าแบบ",
        "เหล็กเมน เหล็กรัดรอบ และเหล็กตอม่อถูกชนิด ขนาด จำนวน",
        "ตรวจเทียบแบบโครงสร้างก่อนเทคอนกรีต"
      ],
      [
        "วางเหล็กและเข้าแบบ",
        "เหล็กฐานรากและเหล็กตอม่อได้ศูนย์ ดิ่ง ฉาก และระดับ",
        "ตำแหน่งเหล็กไม่คลาดเคลื่อนจากแบบ"
      ],
      [
        "วางเหล็กและเข้าแบบ",
        "ระยะหุ้มคอนกรีต ลูกปูน และการทาบต่อเหล็กถูกต้อง",
        "เหล็กไม่แตะแบบหรือดิน และระยะทาบครบตามแบบ"
      ],
      [
        "วางเหล็กและเข้าแบบ",
        "แบบหล่อแน่นหนา แข็งแรง และไม่รั่วซึม",
        "แบบไม่บวม ไม่เคลื่อน และค้ำยันแข็งแรง"
      ],
      [
        "งานระบบฝัง",
        "Sleeve ท่อ กราวด์ และงานระบบที่ฝังในฐานรากครบถ้วน",
        "ตำแหน่งถูกต้อง ไม่ตัดเหล็กหลัก และอุดปลายท่อก่อนเท"
      ],
      [
        "เทคอนกรีต",
        "สเปกคอนกรีต กำลังอัด slump และเวลาขนส่งถูกต้อง",
        "ตรวจใบส่งคอนกรีตและทดสอบ slump ก่อนเท"
      ],
      [
        "เทคอนกรีต",
        "จี้คอนกรีตแน่น ไม่เกิดโพรงหรือรังผึ้ง",
        "ใช้เครื่องจี้เหมาะสมและจี้ทั่วถึง"
      ],
      [
        "หลังเท",
        "ระดับเทและผิวหน้าฐานราก/ตอม่อถูกต้อง",
        "พร้อมรับงานถัดไปและบ่มตามระยะเวลาที่กำหนด"
      ]
    ]
  },
  {
    "template_id": "qc-structure-ground-beam",
    "category": "โครงสร้าง",
    "phase": "งานคานคอดิน",
    "title": "ตรวจงานคานคอดิน",
    "items": [
      [
        "ปรับระดับและแบบ",
        "เบอร์คาน ขนาด ตำแหน่ง ระดับท้องคานและหลังคานตรงตามแบบ",
        "ตรวจแนว ระดับ และขนาดก่อนวางเหล็ก"
      ],
      [
        "ปรับระดับและแบบ",
        "ทรายปรับระดับหรือวัสดุรองพื้นแน่น ได้ระดับและสะอาด",
        "ไม่มีดินอ่อน น้ำขัง หรือเศษวัสดุใต้ท้องคาน"
      ],
      [
        "วางเหล็กและเข้าแบบ",
        "เหล็กเมน เหล็กปลอก และเหล็กเสริมพิเศษถูกชนิด ขนาด จำนวน",
        "ตรวจนับและตรวจระยะปลอกก่อนปิดแบบ"
      ],
      [
        "วางเหล็กและเข้าแบบ",
        "การทาบต่อเหล็ก ระยะทาบ ตำแหน่ง และระยะหุ้มคอนกรีตถูกต้อง",
        "มีลูกปูนเพียงพอ เหล็กไม่แตะแบบหรือดิน"
      ],
      [
        "วางเหล็กและเข้าแบบ",
        "แบบหล่อแน่นหนา ได้แนว และค้ำยันแข็งแรง",
        "แบบไม่บวม ไม่รั่ว และรองรับแรงเทคอนกรีตได้"
      ],
      [
        "งานระบบฝัง",
        "Sleeve ท่อสุขาภิบาล/ไฟฟ้าไม่ตัดเหล็กหลัก",
        "ตำแหน่ง sleeve ถูกต้องและอุดปลายท่อก่อนเท"
      ],
      [
        "เทคอนกรีต",
        "สเปกคอนกรีต slump และการจี้คอนกรีตถูกต้อง",
        "ผิวคานไม่เกิดโพรงและไม่ทำให้เหล็กหรือแบบเคลื่อน"
      ]
    ]
  },
  {
    "template_id": "qc-structure-column",
    "category": "โครงสร้าง",
    "phase": "งานเสา",
    "title": "ตรวจงานเสาคอนกรีต",
    "items": [
      [
        "วางเหล็กและเข้าแบบ",
        "ขนาดเสา ตำแหน่ง ระดับ และแนวตรงตามแบบ",
        "ตรวจระยะศูนย์เสา ดิ่ง ฉาก และขนาดหน้าตัด"
      ],
      [
        "วางเหล็กและเข้าแบบ",
        "เหล็กเมน เหล็กปลอก ระยะปลอก และตะขอถูกต้อง",
        "ตรวจเทียบแบบโครงสร้างทุกด้าน"
      ],
      [
        "วางเหล็กและเข้าแบบ",
        "การทาบต่อเหล็กและระยะหุ้มคอนกรีตถูกต้อง",
        "มี cover block รอบเสาและเหล็กไม่แตะแบบ"
      ],
      [
        "วางเหล็กและเข้าแบบ",
        "แบบเสาแน่นหนา ค้ำยันแข็งแรง และได้ดิ่ง",
        "แบบไม่บวม ไม่รั่ว และล็อกแน่นก่อนเท"
      ],
      [
        "งานระบบฝัง",
        "กล่องไฟ ท่อ หรือ insert ที่ฝังในเสาอยู่ในตำแหน่งอนุมัติ",
        "ไม่ตัดเหล็กหลักและยึดแน่นก่อนเท"
      ],
      [
        "เทคอนกรีต",
        "สเปกคอนกรีต กำลังอัด slump และเวลาขนส่งถูกต้อง",
        "ตรวจใบส่งคอนกรีตและ reject หากไม่ตรงสเปก"
      ],
      [
        "เทคอนกรีต",
        "เทเป็นชั้นและจี้คอนกรีตแน่นทั่วถึง",
        "ไม่เกิดโพรง รังผึ้ง หรือการแยกตัวของคอนกรีต"
      ],
      [
        "หลังเท",
        "ถอดแบบตามเวลาและตรวจผิวเสาหลังถอดแบบ",
        "ผิวเสาไม่แตกร้าว โพรงรุนแรง หรือบิดเบี้ยว"
      ]
    ]
  },
  {
    "template_id": "qc-structure-cast-in-place-slab",
    "category": "โครงสร้าง",
    "phase": "งานพื้นหล่อในที่",
    "title": "ตรวจงานพื้นหล่อในที่",
    "items": [
      [
        "วางเหล็กและเข้าแบบ",
        "ความหนาพื้น ระดับ และแนวแบบตรงตามแบบ",
        "ตรวจระดับท้องพื้น ผิวพื้น และขอบแบบก่อนวางเหล็ก"
      ],
      [
        "วางเหล็กและเข้าแบบ",
        "เหล็กเสริมทางสั้น/ทางยาว ชนิด ขนาด จำนวน และระยะถูกต้อง",
        "ตรวจทิศทางเหล็กและตำแหน่งเหล็กบน/ล่าง"
      ],
      [
        "วางเหล็กและเข้าแบบ",
        "เหล็กเสริมพิเศษรอบช่องเปิด มุมเสา และบริเวณรับแรงครบถ้วน",
        "ตรวจช่องท่อ ช่องบันได และขอบพื้น"
      ],
      [
        "วางเหล็กและเข้าแบบ",
        "ท่อระบบสุขาภิบาล/ไฟฟ้าฝังในพื้นครบและไม่ชนเหล็กหลัก",
        "ตำแหน่ง sleeve/ท่อถูกต้องและอุดปลายท่อก่อนเท"
      ],
      [
        "วางเหล็กและเข้าแบบ",
        "ระยะหุ้มคอนกรีต ลูกปูน chair bar แบบ และค้ำยันเพียงพอ",
        "เหล็กอยู่ระดับถูกต้องและแบบรับแรงได้"
      ],
      [
        "เทคอนกรีต",
        "สเปกคอนกรีต slump กำลังอัด การจี้ และการปาดระดับถูกต้อง",
        "ผิวพื้นได้ระดับ ไม่เกิดแอ่งน้ำหรือร้าวผิดปกติ"
      ],
      [
        "หลังเท",
        "บ่มคอนกรีตและควบคุมการถอดค้ำยันตามกำหนด",
        "ไม่ถอดค้ำยันหรือรับน้ำหนักก่อนเวลาวิศวกรกำหนด"
      ]
    ]
  },
  {
    "template_id": "qc-structure-precast-slab",
    "category": "โครงสร้าง",
    "phase": "งานพื้นสำเร็จรูป",
    "title": "ตรวจงานพื้นสำเร็จรูป",
    "items": [
      [
        "ก่อนวางพื้นสำเร็จ",
        "ขนาดพื้นสำเร็จ ความยาว ทิศทางการวาง และระยะนั่งคานถูกต้อง",
        "ตรวจเทียบแบบและ shop drawing ก่อนยกวาง"
      ],
      [
        "ก่อนวางพื้นสำเร็จ",
        "สเปกพื้นสำเร็จ เหล็กเสริม และอายุคอนกรีตตรงตามแบบ",
        "ตรวจชนิดแผ่นพื้น ความหนา และเอกสารรับรองจากโรงงาน"
      ],
      [
        "ก่อนวางพื้นสำเร็จ",
        "สภาพแผ่นพื้นสมบูรณ์ ไม่โก่ง ร้าว แตก หรือหัก",
        "คัดแยกแผ่นเสียหายก่อนติดตั้ง"
      ],
      [
        "วางพื้นสำเร็จและเข้าแบบ",
        "ความชิดของแผ่นพื้น รอยต่อ และการอุดร่องเรียบร้อย",
        "แผ่นพื้นเรียงแนว ไม่เหลื่อม และอุดร่องก่อนเท topping"
      ],
      [
        "วางพื้นสำเร็จและเข้าแบบ",
        "ตัดแต่งช่องเปิด เหล็กยึดหัวแผ่น wire mesh และท่อฝังพื้นถูกต้อง",
        "ไม่ตัดแผ่นเกินแบบและไม่ทำให้ topping บางเกิน"
      ],
      [
        "เท topping",
        "ความหนา topping สเปกคอนกรีต การปาดระดับ และการบ่มถูกต้อง",
        "ห้ามรับน้ำหนักหรือถอดค้ำยันก่อนกำหนด"
      ]
    ]
  },
  {
    "template_id": "qc-architecture-roof",
    "category": "สถาปัตย์",
    "phase": "งานหลังคา",
    "title": "ตรวจงานหลังคา",
    "items": [
      [
        "วัสดุมุงหลังคา",
        "กระเบื้องหรือวัสดุมุงสภาพสมบูรณ์ ไม่มีแผ่นแตก บิ่น หรือร้าว",
        "คัดวัสดุเสียหายออกก่อนติดตั้ง"
      ],
      [
        "วัสดุมุงหลังคา",
        "แนวมุง ระยะซ้อนทับ ครอบสัน ครอบตะเข้ รางน้ำ และ flashing ถูกต้อง",
        "แนวตรง ยึดแน่น และป้องกันน้ำย้อน"
      ],
      [
        "วัสดุมุงหลังคา",
        "ฟอยล์หรือฉนวนใต้หลังคาเรียบร้อย ไม่ฉีกขาด",
        "ต่อซ้อนและยึดแน่นก่อนปิดหลังคา"
      ],
      [
        "วัสดุมุงหลังคา",
        "หลังคาสะอาด ไม่มีคราบปูน เศษวัสดุ หรือสีเลอะ",
        "ทำความสะอาดหลังติดตั้งก่อนส่งตรวจ"
      ],
      [
        "วัสดุมุงหลังคา",
        "ทดสอบการรั่วซึมของหลังคา",
        "ฉีดน้ำหรือทดสอบหลังฝนตกแล้วไม่พบรั่วซึม"
      ],
      [
        "โครงหลังคา",
        "รอยเชื่อม จุดยึด น็อต สกรู และแผ่นเพลทแข็งแรงครบทุกจุด",
        "ตรวจตามแบบและแก้ไขจุดหลวม/ขาด"
      ],
      [
        "โครงหลังคา",
        "ทาสีกันสนิมทั่วทุกพื้นผิว",
        "เหล็กทุกชิ้นได้รับการป้องกันสนิมก่อนปิดงาน"
      ],
      [
        "โครงหลังคา",
        "ไม้เชิงชาย ปั้นลม แผ่นปิดลอน และตะแกรงกันสัตว์ติดตั้งเรียบร้อย",
        "แนวตรงและปิดช่องว่างครบถ้วน"
      ]
    ]
  },
  {
    "template_id": "qc-architecture-floor",
    "category": "สถาปัตย์",
    "phase": "งานพื้น",
    "title": "ตรวจงานพื้นและพื้นเปียก",
    "items": [
      [
        "พื้นปูกระเบื้อง",
        "กระเบื้องปูเรียบเนียน เสมอกัน ไม่โก่งตัว",
        "ตรวจระดับและความเรียบด้วยอุปกรณ์ที่เหมาะสม"
      ],
      [
        "พื้นปูกระเบื้อง",
        "กระเบื้องไม่มีรอยบิ่น แตกร้าว ขีดข่วน หรือเสียหาย",
        "เปลี่ยนแผ่นเสียหายก่อนส่งมอบ"
      ],
      [
        "พื้นปูกระเบื้อง",
        "ปูนใต้กระเบื้องแน่น ไม่มีโพรง",
        "เคาะตรวจทุกพื้นที่หรือสุ่มตามจุดเสี่ยง"
      ],
      [
        "พื้นปูกระเบื้อง",
        "ผิวกระเบื้องสะอาด ยาแนวเรียบร้อย สีสม่ำเสมอ และเต็มร่อง",
        "ไม่มีคราบปูน สี หรือยาแนวหลุดร่อน"
      ],
      [
        "บัวพื้น",
        "บัวพื้นแนบสนิทกับผนัง เรียบตรง และเก็บรอยต่อเรียบร้อย",
        "ไม่มีช่องว่างหรือคราบเลอะบริเวณรอยต่อ"
      ],
      [
        "พื้นที่รับน้ำหรือเปียกน้ำ",
        "พื้นมี slope ระบายน้ำได้ดี น้ำไม่ขัง",
        "ทดสอบขังน้ำ/ปล่อยน้ำแล้วระบายลง drain ได้ครบ"
      ],
      [
        "พื้นที่รับน้ำหรือเปียกน้ำ",
        "งานกันซึมผ่านการทดสอบก่อนปูกระเบื้อง",
        "ทดสอบขังน้ำตามระยะเวลาที่กำหนดและไม่พบรั่ว"
      ],
      [
        "พื้นที่รับน้ำหรือเปียกน้ำ",
        "ตะแกรง drain อยู่ระดับเหมาะสมและเปิดใช้งานได้",
        "น้ำไหลเข้าท่อได้ดี ไม่มีเศษวัสดุอุดตัน"
      ]
    ]
  },
  {
    "template_id": "qc-architecture-wall",
    "category": "สถาปัตย์",
    "phase": "งานผนัง",
    "title": "ตรวจงานผนังก่อฉาบและทาสี",
    "items": [
      [
        "งานก่อฉาบ",
        "แนวผนังไม่เอียง ไม่ล้ม ได้ดิ่ง ฉาก และแนว",
        "ตรวจด้วยลูกดิ่ง ระดับน้ำ และเช็กมุมห้องตามแบบ"
      ],
      [
        "งานก่อฉาบ",
        "ผนังตามมุมห้องและมุมเสาได้ฉาก ตรง และไม่มีรอยบิ่น",
        "มุมคมชัด มีเซี้ยมมุมหรือ corner bead ตามความเหมาะสม"
      ],
      [
        "งานก่อฉาบ",
        "ผิวผนังเรียบเนียน ไม่เป็นคลื่น ไม่มีรอยแตกร้าว",
        "ตรวจด้วยแสงเฉียงและไม้บรรทัดยาว"
      ],
      [
        "งานก่อฉาบ",
        "ผนังไม่เป็นโพรง เคาะแล้วไม่ร่อน",
        "เคาะตรวจผิวฉาบและแก้ไขจุดโพรงก่อนทาสี"
      ],
      [
        "งานก่อฉาบ",
        "ช่องเปิดประตูหน้าต่างได้ขนาดและฉาก",
        "ตรวจระยะช่องเปิดก่อนติดตั้งวงกบ/เฟรม"
      ],
      [
        "งานทาสี",
        "ทาสีเรียบเนียน สม่ำเสมอ ไม่มีรอยด่างหรือสีหลุดร่อน",
        "จำนวนเที่ยวสีและระบบรองพื้นตรงตามสเปก"
      ],
      [
        "งานทาสี",
        "เก็บสีขอบวงกบ ขอบฝ้า มุมผนัง และขอบบัวเรียบร้อย",
        "แนวตัดสีตรง คมชัด ไม่มีเปื้อนวัสดุอื่น"
      ],
      [
        "งานทาสี",
        "ผนังสะอาด ไม่มีคราบสกปรก ละอองปูน หรือสีเลอะ",
        "ทำความสะอาดและเก็บงานก่อนส่งตรวจ"
      ]
    ]
  },
  {
    "template_id": "qc-architecture-ceiling",
    "category": "สถาปัตย์",
    "phase": "งานฝ้าเพดาน",
    "title": "ตรวจงานฝ้าเพดาน",
    "items": [
      [
        "ติดตั้งฝ้า",
        "ระดับฝ้าเท่ากันทั้งห้อง ไม่มีแอ่นตัวหรือตกท้องช้าง",
        "ตรวจระดับและแนวฝ้าทุกพื้นที่ก่อนปิดงาน"
      ],
      [
        "ติดตั้งฝ้า",
        "ผิวฝ้าเรียบเนียน ไม่เป็นคลื่น และขอบฝ้าเรียบตรง",
        "ตรวจแสงเฉียงและแนวรอยต่อแผ่น"
      ],
      [
        "ติดตั้งฝ้า",
        "ช่องเซอร์วิส ช่องไฟ และตำแหน่งอุปกรณ์ตรงตามแบบ",
        "ตำแหน่ง access panel, downlight, diffuser และ detector ถูกต้อง"
      ],
      [
        "ติดตั้งฝ้า",
        "รอยต่อแผ่นฝ้าและหัวสกรูเก็บเรียบร้อย",
        "ไม่มีรอยปูด บวม หรือแตกร้าวที่รอยต่อ"
      ],
      [
        "งานทาสีฝ้า",
        "ทาสีเรียบเนียน ไม่มีรอยด่างหรือหลุดร่อน",
        "สีสม่ำเสมอและไม่มีรอยลูกกลิ้ง/แปรงชัดเจน"
      ],
      [
        "ฝ้าภายนอก/ฝ้าหลุม/ฝ้าหลืบ",
        "ขอบฝ้าเรียบคม ตรง ได้แนว",
        "แนวฝ้าพิเศษได้รูปและไฟซ่อนติดตั้งได้จริง"
      ],
      [
        "ระบบเหนือฝ้า",
        "โครงคร่าวและแขวนฝ้าแข็งแรง ระยะถูกต้อง",
        "ตรวจจุดแขวน โครงคร่าว และการกันสนิมก่อนปิดฝ้า"
      ]
    ]
  },
  {
    "template_id": "qc-architecture-openings",
    "category": "สถาปัตย์",
    "phase": "งานช่องเปิด",
    "title": "ตรวจงานประตูและหน้าต่าง",
    "items": [
      [
        "บานอลูมิเนียม/หน้าต่าง",
        "บานเปิด-ปิดได้ปกติ ลื่น และไม่ติดขัด",
        "ทดสอบทุกบานหลังติดตั้ง"
      ],
      [
        "บานอลูมิเนียม/หน้าต่าง",
        "อุปกรณ์ล็อก มือจับ บานพับ ราง และช่องระบายน้ำใช้งานได้",
        "อุปกรณ์ครบ ยึดแน่น และน้ำไม่ขังในราง"
      ],
      [
        "บานอลูมิเนียม/หน้าต่าง",
        "อลูมิเนียม กระจก ยางขอบ และ sealant ไม่มีเสียหาย",
        "รอยซีลต่อเนื่อง ไม่มีช่องน้ำเข้า"
      ],
      [
        "บานอลูมิเนียม/หน้าต่าง",
        "ทดสอบการรั่วซึมของบานประตูหน้าต่าง",
        "ฉีดน้ำทดสอบแล้วไม่พบรั่วซึมเข้าภายใน"
      ],
      [
        "บานประตูไม้",
        "วงกบและบานประตูสภาพดี เก็บสีเรียบร้อย ไม่มีรอยด่าง",
        "ผิวบานและวงกบไม่มีบวม แตก หรือบิด"
      ],
      [
        "บานประตูไม้",
        "บานประตูแข็งแรง เปิด-ปิดได้ปกติ และแนบสนิทกับวงกบ",
        "ระยะช่องไฟรอบบานสม่ำเสมอ ไม่ขูดพื้น และไม่คืนตัว"
      ],
      [
        "บานประตูไม้",
        "ลูกบิด กลอน และระบบล็อกใช้งานได้ปกติ",
        "ทดสอบล็อกทุกชุดและส่งมอบกุญแจครบ"
      ]
    ]
  },
  {
    "template_id": "qc-architecture-stair",
    "category": "สถาปัตย์",
    "phase": "งานบันไดและราว",
    "title": "ตรวจงานบันไดและราวบันได",
    "items": [
      [
        "งานบันได",
        "ลูกตั้งและลูกนอนมีขนาดสม่ำเสมอทุกขั้น",
        "ขนาดขั้นไม่ต่างกันจนเกิดอันตรายในการใช้งาน"
      ],
      [
        "งานบันได",
        "พื้นบันไดแน่น เรียบ ได้ระดับ ไม่สั่น ไม่ยวบ",
        "ทดสอบเดินและตรวจการยึดวัสดุปิดผิว"
      ],
      [
        "งานบันได",
        "แนวบันไดได้ฉาก ได้แนว และขนานกันทุกขั้น",
        "ตรวจแนวขอบขั้นและจมูกบันไดตลอดแนว"
      ],
      [
        "งานบันได",
        "ผิวบันไดขัดแต่ง เก็บสี/เคลือบเรียบร้อย ไม่มีรอยขีดข่วน",
        "ผิวสัมผัสเรียบ ไม่บาดมือหรือเสี่ยงสะดุด"
      ],
      [
        "ราวบันได",
        "โครงเหล็กหรือราวบันไดติดตั้งแข็งแรง ไม่โยกคลอน",
        "ทดสอบแรงโยกและตรวจจุดยึดทุกจุด"
      ],
      [
        "ราวบันได",
        "ระยะห่างลูกกรง ความสูงราว และช่องว่างปลอดภัย",
        "เป็นไปตามแบบและลดความเสี่ยงเด็กพลัดตก"
      ],
      [
        "ราวบันได",
        "ขัดแต่ง เก็บสี และผิวราวจับเรียบเนียน",
        "ไม่มีคม รอยเชื่อมบาดมือ หรือสีหลุดร่อน"
      ]
    ]
  },
  {
    "template_id": "qc-architecture-sanitary-fixtures",
    "category": "สถาปัตย์",
    "phase": "สุขภัณฑ์ห้องน้ำ",
    "title": "ตรวจสุขภัณฑ์ห้องน้ำ",
    "items": [
      [
        "สุขภัณฑ์ทั้งหมด",
        "สุขภัณฑ์ติดตั้งถูกตำแหน่ง ระยะ และความสูงตามแบบ",
        "ตำแหน่งใช้งานสะดวก ได้ระดับ ไม่เอียง"
      ],
      [
        "สุขภัณฑ์ทั้งหมด",
        "อุปกรณ์ครบถ้วน ยึดแน่น แข็งแรง ไม่โยกคลอน",
        "ตรวจจุดยึด อุปกรณ์ประกอบ และ sealant รอบฐาน"
      ],
      [
        "สุขภัณฑ์ทั้งหมด",
        "สุขภัณฑ์ไม่ชำรุด ไม่มีรอยแตกร้าวหรือรอยบิ่น",
        "เปลี่ยนชิ้นที่เสียหายก่อนส่งมอบ"
      ],
      [
        "สุขภัณฑ์ทั้งหมด",
        "ทดสอบการใช้งานทั้งระบบน้ำดีและน้ำทิ้ง",
        "น้ำไหลดี ระบายได้ดี และไม่พบการรั่วซึม"
      ],
      [
        "สุขภัณฑ์ทั้งหมด",
        "สุขภัณฑ์ชักโครกกดชำระได้ดี ไม่มีสิ่งตกค้าง",
        "ทดสอบ flush หลายครั้งและตรวจระดับน้ำในโถ"
      ],
      [
        "สุขภัณฑ์ทั้งหมด",
        "เก็บยาแนวและซิลิโคนรอบสุขภัณฑ์เรียบร้อย",
        "รอยต่อสะอาด สวยงาม และป้องกันน้ำซึม"
      ],
      [
        "กระจกและอุปกรณ์",
        "กระจก ชั้นวาง ราวแขวน และอุปกรณ์ห้องน้ำครบตามแบบ",
        "ติดตั้งได้ระดับ ยึดแน่น และใช้งานได้จริง"
      ],
      [
        "ความปลอดภัย",
        "ปลั๊กหรืออุปกรณ์ไฟฟ้าในห้องน้ำอยู่ในตำแหน่งปลอดภัย",
        "ตรวจระยะจากพื้นที่เปียกและการป้องกันไฟดูด"
      ]
    ]
  },
  {
    "template_id": "qc-mep-electrical",
    "category": "งานระบบ",
    "phase": "งานระบบไฟฟ้า",
    "title": "ตรวจงานระบบไฟฟ้า",
    "items": [
      [
        "ตู้โหลดเซ็นเตอร์",
        "อุปกรณ์ในตู้ครบถ้วนและถูกต้องตามแบบ",
        "ขนาด main breaker, MCB, RCD/RCBO และวงจรถูกต้อง"
      ],
      [
        "ตู้โหลดเซ็นเตอร์",
        "การต่อสายไฟถูกต้องตามมาตรฐาน",
        "สายแน่น มี busbar/terminal ถูกต้อง และไม่มีสายหลวม"
      ],
      [
        "ตู้โหลดเซ็นเตอร์",
        "ติดป้ายชื่อวงจรและจัดระเบียบสายเรียบร้อย",
        "ระบุวงจรครบ อ่านง่าย และตรงกับพื้นที่ใช้งาน"
      ],
      [
        "ตู้โหลดเซ็นเตอร์",
        "ระบบสายดินและหลักดินต่อครบถ้วน",
        "ตรวจ continuity และค่าความต้านทานดินตามมาตรฐานที่โครงการกำหนด"
      ],
      [
        "ปลั๊กและสวิตช์",
        "ปลั๊กไฟใช้งานได้ทุกจุดและ polarity ถูกต้อง",
        "ทดสอบด้วยเครื่องมือทุกจุดก่อนส่งมอบ"
      ],
      [
        "ปลั๊กและสวิตช์",
        "สวิตช์เปิด-ปิดได้สะดวกและควบคุมถูกดวง",
        "ทดสอบทุกสวิตช์และทุกวงจรไฟ"
      ],
      [
        "ปลั๊กและสวิตช์",
        "ฝาครอบติดตั้งได้ระดับ ไม่เอียง และแนบผนัง",
        "ตำแหน่งตรงตามแบบและเก็บขอบเรียบร้อย"
      ],
      [
        "แสงสว่างและเครื่องใช้ไฟฟ้า",
        "โคมไฟติดตั้งได้แนว ระดับ และใช้งานครบทุกดวง",
        "ตรวจสีแสง ความสว่าง และการทำงานของ driver/transformer"
      ],
      [
        "แสงสว่างและเครื่องใช้ไฟฟ้า",
        "เครื่องใช้ไฟฟ้าและอุปกรณ์เฉพาะครบตามแบบ",
        "ทดสอบพัดลมดูดอากาศ ปั๊ม ประตูรีโมต หรืออุปกรณ์อื่นตามรายการ"
      ],
      [
        "ความปลอดภัย",
        "ทดสอบ RCD/RCBO และฉนวนสายไฟ",
        "อุปกรณ์ตัดไฟทำงานและไม่มีไฟรั่วผิดปกติ"
      ]
    ]
  },
  {
    "template_id": "qc-mep-plumbing",
    "category": "งานระบบ",
    "phase": "งานสุขาภิบาล",
    "title": "ตรวจงานสุขาภิบาล",
    "items": [
      [
        "ท่อน้ำดีและท่อน้ำเสีย",
        "การยึดล็อกท่อน้ำแข็งแรง เรียบร้อย",
        "ระยะ support เหมาะสม ท่อไม่หย่อนหรือแกว่ง"
      ],
      [
        "ท่อน้ำดีและท่อน้ำเสีย",
        "เมื่อเปิดใช้งานหรือระบายน้ำ น้ำไหลได้ดี ไม่มีติดขัด",
        "ทดสอบทุกจุดใช้น้ำและทุก floor drain"
      ],
      [
        "ท่อน้ำดีและท่อน้ำเสีย",
        "ไม่มีร่องรอยรั่วซึมของน้ำที่จุดต่อในระบบ",
        "ทดสอบแรงดันท่อน้ำดีและตรวจจุดต่อทุกจุด"
      ],
      [
        "ท่อน้ำดีและท่อน้ำเสีย",
        "เมื่อปิดระบบน้ำทั้งหมด มิเตอร์น้ำต้องไม่เดิน",
        "ทดสอบ leak test หลังปิดก๊อกทุกจุด"
      ],
      [
        "ท่อน้ำดีและท่อน้ำเสีย",
        "ตำแหน่งวาล์วและ clean out เข้าถึงได้",
        "มีช่อง service หรือจุดเปิดซ่อมบำรุงตามความจำเป็น"
      ],
      [
        "ท่อระบายน้ำทิ้ง",
        "ท่อระบายน้ำมี slope ต่อเนื่อง ไม่มีน้ำไหลย้อน",
        "ทดสอบปล่อยน้ำจากต้นทางถึงปลายทาง"
      ],
      [
        "ท่อระบายน้ำทิ้ง",
        "ไม่มีเศษขยะในบ่อพักและท่อทุกจุด",
        "ล้างระบบและตรวจบ่อพักก่อนส่งมอบ"
      ],
      [
        "ท่อระบายน้ำทิ้ง",
        "เชื่อมต่อเข้าท่อสาธารณะหรือบ่อบำบัดถูกต้อง",
        "ทิศทางน้ำและระดับท่อปลายทางไม่ย้อนกลับ"
      ],
      [
        "ท่อระบายน้ำทิ้ง",
        "ทดสอบบ่อดักไขมันและบ่อพักใช้งานได้ปกติ",
        "น้ำผ่านได้ดี ฝาปิดเรียบร้อย และไม่มีกลิ่นย้อน"
      ],
      [
        "ระบบป้องกันกลิ่น",
        "มี trap หรืออุปกรณ์กันกลิ่นในจุดที่จำเป็น",
        "ทดสอบแล้วไม่มีกลิ่นย้อนจากท่อระบายน้ำ"
      ]
    ]
  },
  {
    "template_id": "qc-architecture-exterior",
    "category": "สถาปัตย์",
    "phase": "งานภายนอก",
    "title": "ตรวจงานภายนอกและพื้นที่รอบบ้าน",
    "items": [
      [
        "เคลียร์พื้นที่รอบบ้าน",
        "ปรับระดับดินเรียบร้อย ระดับสม่ำเสมอ ไม่มีหลุมบ่อ",
        "พื้นที่รอบบ้านเดินได้ปลอดภัยและไม่ขังน้ำ"
      ],
      [
        "เคลียร์พื้นที่รอบบ้าน",
        "เก็บเศษวัสดุก่อสร้างและขยะออกทั้งหมด",
        "พื้นที่สะอาดก่อนส่งมอบ"
      ],
      [
        "เคลียร์พื้นที่รอบบ้าน",
        "ดินถมและพื้นที่ข้างบ้านมี slope ระบายน้ำออกจากตัวบ้าน",
        "น้ำฝนไม่ไหลย้อนเข้าฐานรากหรือผนังบ้าน"
      ],
      [
        "ที่จอดรถ",
        "พื้นจอดรถเรียบสม่ำเสมอ ไม่มีหลุมบ่อหรือรอยทรุด",
        "ตรวจระดับและความเรียบร้อยของผิวพื้น"
      ],
      [
        "ที่จอดรถ",
        "พื้นที่จอดรถระบายน้ำได้ดี น้ำไม่ท่วมขัง",
        "ทดสอบปล่อยน้ำและตรวจ slope ไปยังท่อระบายน้ำ"
      ],
      [
        "รั้ว",
        "ผนังรั้วได้ดิ่ง ได้แนว ไม่เอียง ไม่ล้ม",
        "ตรวจแนวรั้ว เสา และฐานรากรั้วตามแบบ"
      ],
      [
        "รั้ว",
        "ผิวผนังรั้วเรียบ ไม่มีรอยแตกร้าว",
        "รอยฉาบและรอยต่อวัสดุเก็บเรียบร้อย"
      ],
      [
        "รั้ว",
        "ทาสีรั้วเรียบเนียน สม่ำเสมอ ไม่มีสีโป่งพอง",
        "สีภายนอกเหมาะสมและทนสภาพอากาศ"
      ],
      [
        "รั้ว",
        "ประตูรั้วและอุปกรณ์ล็อกใช้งานได้ปกติ",
        "เปิด-ปิดลื่น ยึดแข็งแรง และไม่ฝืด"
      ],
      [
        "งานระบายน้ำภายนอก",
        "รางระบายน้ำและบ่อพักรอบบ้านไหลได้ดี",
        "ไม่มีเศษวัสดุอุดตันและฝาปิดเรียบร้อย"
      ]
    ]
  }
] as const;
export function createQcId() {
  return `QC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function createQcApprovalToken() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.slice(0, 40);
}

export function createQcItemId(index: number) {
  return `QCI-${String(index + 1).padStart(3, "0")}`;
}

export function templateToItems(templateId: string) {
  const template = QC_TEMPLATES.find((item) => item.template_id === templateId) || QC_TEMPLATES[0];
  return template.items.map(([section, title, acceptance], index) => ({
    item_id: createQcItemId(index),
    section,
    title,
    acceptance,
    result: "pending" as const,
    notes: "",
  }));
}

export function parseQcItems(value?: string | number) {
  if (!value) return [] as QcChecklistItem[];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.filter(Boolean) as QcChecklistItem[] : [];
  } catch {
    return [];
  }
}

export function parseQcEvidence(value?: string | number) {
  if (!value) return [] as QcEvidenceFile[];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.filter(Boolean) as QcEvidenceFile[] : [];
  } catch {
    return [];
  }
}

export function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value ?? []);
  } catch {
    return "[]";
  }
}

export function createQcDocumentNo(projectId: string, records: QcChecklistRecord[]) {
  const prefix = `QC-${projectId}-`;
  const nextNo = records
    .map((record) => String(record.document_no || ""))
    .filter((documentNo) => documentNo.startsWith(prefix))
    .map((documentNo) => Number(documentNo.slice(prefix.length)))
    .filter(Number.isFinite)
    .reduce((max, value) => Math.max(max, value), 0) + 1;
  return `${prefix}${String(nextNo).padStart(3, "0")}`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatThaiDate(value?: string | number) {
  if (!value) return "-";
  const date = new Date(String(value).includes("T") ? String(value) : `${String(value)}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function countResults(items: QcChecklistItem[]) {
  return {
    total: items.length,
    pass: items.filter((item) => item.result === "pass").length,
    fail: items.filter((item) => item.result === "fail").length,
    repair: items.filter((item) => item.result === "repair").length,
    pending: items.filter((item) => item.result === "pending" || !item.result).length,
  };
}

export function getQcApprovalReadiness(items: QcChecklistItem[]) {
  const counts = countResults(items);
  const issue = counts.fail + counts.repair;
  const ready = counts.total > 0 && counts.pass === counts.total && issue === 0 && counts.pending === 0;
  let reason = "";
  if (!counts.total) reason = "ยังไม่มีรายการตรวจ QC";
  else if (issue > 0) reason = `ยังอนุมัติไม่ได้ เพราะมีรายการต้องแก้ไข/ไม่ผ่าน ${issue} ข้อ`;
  else if (counts.pending > 0) reason = `ยังอนุมัติไม่ได้ เพราะยังไม่ได้ตรวจ ${counts.pending} ข้อ`;
  else if (counts.pass !== counts.total) reason = "ยังอนุมัติไม่ได้ เพราะรายการ QC ยังผ่านไม่ครบทุกข้อ";
  return {
    ...counts,
    issue,
    ready,
    reason,
    summary: issue > 0 ? `${counts.pass}/${counts.total} ผ่าน, ${issue} ต้องแก้ไข` : `${counts.pass}/${counts.total} ผ่าน`,
  };
}

export function buildQcLineMessage({
  projectName,
  projectId,
  title,
  category,
  phase,
  resultSummary,
}: {
  projectName: string;
  projectId: string;
  title: string;
  category: string;
  phase: string;
  resultSummary: string;
}) {
  return [
    "แจ้งขออนุมัติ QC Checklist",
    "",
    `โครงการ: ${projectName || projectId}`,
    `หมวดงาน: ${category}`,
    `ช่วงงาน: ${phase}`,
    `รายการตรวจ: ${title}`,
    `ผลตรวจ: ${resultSummary}`,
    "",
    "กรุณาตรวจสอบรายงานและยืนยันอนุมัติในกลุ่มนี้ เพื่อให้ทีมงานดำเนินงานขั้นถัดไปครับ",
  ].join("\n");
}

export function buildQcLineFlex({
  projectName,
  projectId,
  documentNo,
  title,
  category,
  phase,
  resultSummary,
  pdfUrl,
  evidenceUrl,
  approvalUrl,
}: {
  projectName: string;
  projectId: string;
  documentNo?: string;
  title: string;
  category: string;
  phase: string;
  resultSummary: string;
  pdfUrl?: string;
  evidenceUrl?: string;
  approvalUrl?: string;
}) {
  const footerContents = [
    ...(approvalUrl ? [{
      type: "button",
      style: "primary",
      color: "#0f766e",
      action: { type: "uri", label: "อนุมัติ QC Checklist", uri: approvalUrl },
    }] : []),
    ...(pdfUrl ? [{
      type: "button",
      style: "primary",
      color: "#111827",
      action: { type: "uri", label: "เปิด PDF รายงาน QC", uri: pdfUrl },
    }] : []),
    ...(evidenceUrl ? [{
      type: "button",
      style: "secondary",
      action: { type: "uri", label: "ดูหลักฐานประกอบ", uri: evidenceUrl },
    }] : []),
  ];

  return {
    type: "flex",
    altText: `QC Checklist | ${projectName || projectId} | ${title}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#0f172a",
        paddingAll: "18px",
        paddingBottom: "16px",
        contents: [
          { type: "text", text: "PMC CONNEXT QC APPROVAL", color: "#7dd3fc", weight: "bold", size: "xs" },
          { type: "text", text: "ขออนุมัติ QC Checklist", color: "#ffffff", weight: "bold", size: "lg", margin: "xs", wrap: true },
          { type: "text", text: documentNo || projectId, color: "#fef3c7", size: "sm", margin: "xs", wrap: true },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "18px",
        contents: [
          { type: "text", text: projectName || projectId, color: "#0f172a", weight: "bold", size: "lg", wrap: true },
          qcLineRow("หมวดงาน", category || "-"),
          qcLineRow("ช่วงงาน", phase || "-"),
          qcLineRow("สถานะ", "รออนุมัติจากลูกค้า"),
          { type: "separator", margin: "md", color: "#e5e7eb" },
          {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            margin: "md",
            contents: [
              { type: "text", text: "รายการตรวจ", color: "#64748b", size: "xs" },
              { type: "text", text: trimLineText(title || "-"), color: "#0f172a", weight: "bold", size: "sm", wrap: true },
            ],
          },
          {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            margin: "sm",
            backgroundColor: "#fff7ed",
            cornerRadius: "8px",
            paddingAll: "10px",
            contents: [
              { type: "text", text: "ผลตรวจ QC", color: "#ea580c", weight: "bold", size: "xs" },
              { type: "text", text: resultSummary || "-", color: "#9a3412", size: "sm", wrap: true },
            ],
          },
          {
            type: "text",
            text: "กรุณาตรวจสอบรายงานและกดอนุมัติ เพื่อให้ทีมงานดำเนินงานขั้นถัดไปได้ตามแผนครับ",
            color: "#475569",
            size: "xs",
            margin: "md",
            wrap: true,
          },
        ],
      },
      ...(footerContents.length > 0 ? {
        footer: {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          paddingAll: "8px",
          contents: footerContents,
        },
      } : {}),
    },
  };
}

export function buildQcApprovedLineFlex({
  projectName,
  projectId,
  documentNo,
  title,
  approvedBy,
  approvedAt,
  pdfUrl,
}: {
  projectName: string;
  projectId: string;
  documentNo?: string;
  title: string;
  approvedBy: string;
  approvedAt: string;
  pdfUrl?: string;
}) {
  const approvedDate = approvedAt
    ? new Date(approvedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })
    : "-";

  return {
    type: "flex",
    altText: `อนุมัติ QC Checklist แล้ว | ${projectName || projectId} | ${title}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#064e3b",
        paddingAll: "20px",
        spacing: "sm",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "PMC CONNEXT", color: "#bbf7d0", weight: "bold", size: "xs", flex: 7 },
              { type: "text", text: "QC APPROVED", color: "#ffffff", weight: "bold", size: "xs", align: "end", flex: 5 },
            ],
          },
          { type: "text", text: "อนุมัติ QC Checklist แล้ว", color: "#ffffff", weight: "bold", size: "xl", margin: "md", wrap: true },
          { type: "text", text: documentNo || projectId, color: "#dcfce7", size: "sm", weight: "bold", wrap: true },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        paddingAll: "18px",
        contents: [
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#f0fdf4",
            cornerRadius: "md",
            paddingAll: "14px",
            spacing: "xs",
            contents: [
              { type: "text", text: projectName || projectId, color: "#052e16", weight: "bold", size: "lg", wrap: true },
              { type: "text", text: "ลูกค้าอนุมัติรายการ QC เรียบร้อยแล้ว ทีมงานสามารถดำเนินงานขั้นถัดไปได้", color: "#166534", size: "xs", wrap: true },
            ],
          },
          qcLineRow("รายการ", trimLineText(title || "-")),
          qcLineRow("ผู้อนุมัติ", approvedBy || "-"),
          qcLineRow("เวลา", approvedDate),
        ],
      },
      ...(pdfUrl ? {
        footer: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          paddingAll: "12px",
          contents: [{
            type: "button",
            style: "primary",
            color: "#111827",
            action: { type: "uri", label: "เปิด PDF รายงาน QC", uri: pdfUrl },
          }],
        },
      } : {}),
    },
  };
}

function qcLineRow(label: string, value: string) {
  return {
    type: "box",
    layout: "horizontal",
    margin: "sm",
    contents: [
      { type: "text", text: label, color: "#64748b", size: "xs", flex: 4 },
      { type: "text", text: value, color: "#0f172a", size: "sm", flex: 8, wrap: true },
    ],
  };
}

function trimLineText(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 360 ? `${normalized.slice(0, 357)}...` : normalized;
}

export function buildQcPdfHtml({
  checklist,
  project,
  logoUrl,
}: {
  checklist: QcChecklistRecord;
  project: Record<string, string | number | undefined>;
  logoUrl: string;
}) {
  const items = parseQcItems(checklist.items_json);
  const evidence = parseQcEvidence(checklist.evidence_files_json);
  const images = evidence.filter((item) => String(item.mime_type || "").startsWith("image/") && (item.data_url || item.file_url));
  const counts = countResults(items);
  const location = [project.address, project.district, project.province].filter(Boolean).join(" ");
  const resultSummary = `${counts.pass}/${counts.total} ผ่าน`;
  const renderImage = (item: QcEvidenceFile) => `
    <figure class="photo-card">
      <div class="photo-frame"><img src="${escapeHtml(item.data_url || item.file_url || "")}" alt="${escapeHtml(item.file_name)}" /></div>
      <figcaption>${escapeHtml(item.file_name || "หลักฐานประกอบ")}</figcaption>
    </figure>
  `;

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(checklist.document_no || "QC Checklist")}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-size: 11px; line-height: 1.45; font-family: Arial, "Tahoma", sans-serif; background: #fff; }
    .sheet { min-height: 273mm; border: 1px solid #cbd5e1; padding: 16px 18px 12px; display: flex; flex-direction: column; }
    .evidence-page { break-before: page; page-break-before: always; }
    .header { display: grid; grid-template-columns: 1fr 176px; gap: 14px; border-top: 6px solid #0f172a; border-bottom: 2px solid #f97316; padding: 12px 0 10px; }
    .brand { display: grid; grid-template-columns: 118px 1fr; gap: 14px; align-items: center; min-width: 0; }
    .brand img { width: 112px; max-height: 48px; object-fit: contain; }
    .brand-title { font-size: 15px; line-height: 1.2; font-weight: 900; color: #0f172a; }
    .brand-subtitle { margin-top: 3px; color: #64748b; font-size: 10px; }
    .company-address { margin-top: 5px; color: #475569; font-size: 9px; line-height: 1.35; }
    .doc-box { border: 1px solid #cbd5e1; background: #f8fafc; padding: 9px 10px; text-align: right; align-self: stretch; }
    .doc-label { color: #64748b; font-size: 8px; font-weight: 900; text-transform: uppercase; }
    .doc-no { margin-top: 4px; font-size: 14px; line-height: 1.2; font-weight: 900; color: #0f172a; }
    .doc-date { margin-top: 8px; color: #475569; font-size: 9px; font-weight: 700; }
    .title-block { margin: 12px 0 10px; text-align: center; }
    .title-block h1 { margin: 0; font-size: 22px; line-height: 1.15; color: #0f172a; font-weight: 900; }
    .title-block .en { margin-top: 3px; color: #64748b; font-size: 10px; font-weight: 800; text-transform: uppercase; }
    .summary-grid { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #cbd5e1; border-bottom: 0; }
    .summary-item { display: grid; grid-template-columns: 96px 1fr; min-height: 29px; border-bottom: 1px solid #cbd5e1; }
    .summary-item.full { grid-column: span 2; }
    .summary-label { background: #f1f5f9; border-right: 1px solid #cbd5e1; padding: 7px 8px; font-weight: 900; color: #334155; }
    .summary-value { padding: 7px 9px; font-weight: 800; color: #0f172a; }
    .result-strip { margin-top: 10px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .metric { border: 1px solid #e2e8f0; background: #f8fafc; padding: 8px; }
    .metric strong { display: block; font-size: 17px; color: #0f172a; }
    .metric span { color: #64748b; font-size: 9px; font-weight: 900; }
    .section-title { margin-top: 12px; display: flex; align-items: center; gap: 8px; color: #0f172a; font-size: 13px; font-weight: 900; }
    .section-title:before { content: ""; width: 4px; height: 15px; background: #f97316; display: inline-block; }
    .items { width: 100%; border-collapse: collapse; margin-top: 7px; }
    .items th { background: #0f172a; color: #fff; padding: 7px; font-size: 10px; text-align: left; }
    .items td { border: 1px solid #cbd5e1; padding: 7px; vertical-align: top; }
    .items .result { width: 72px; text-align: center; font-weight: 900; }
    .notice { margin-top: 9px; border-left: 4px solid #f97316; background: #fff7ed; color: #9a3412; padding: 8px 10px; font-weight: 800; font-size: 10px; }
    .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: auto; padding-top: 18px; }
    .signature { text-align: center; min-height: 78px; border-top: 1px solid #94a3b8; padding-top: 7px; color: #334155; }
    .signature strong { color: #0f172a; font-size: 10px; }
    .footer { margin-top: 11px; border-top: 1px solid #e5e7eb; padding-top: 7px; color: #64748b; font-size: 9px; display: flex; justify-content: space-between; gap: 12px; }
    .page-title { display: grid; grid-template-columns: 1fr 160px; gap: 14px; align-items: end; border-top: 6px solid #0f172a; border-bottom: 2px solid #f97316; padding: 12px 0 10px; }
    .page-title h1 { margin: 0; text-align: left; font-size: 20px; line-height: 1.2; color: #0f172a; }
    .photo-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 12px; }
    .photo-card { margin: 0; border: 1px solid #cbd5e1; padding: 8px; min-height: 92mm; page-break-inside: avoid; background: #fff; }
    .photo-frame { height: 78mm; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #f8fafc; border: 1px solid #e5e7eb; }
    .photo-frame img { width: 100%; height: 100%; object-fit: contain; }
    .photo-card figcaption { margin-top: 6px; color: #334155; font-size: 10px; font-weight: 700; }
  </style>
</head>
<body>
  <main class="page">
    <div class="sheet">
      <header class="header">
        <div class="brand">
          ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="PMC CONNEXT" />` : ""}
          <div>
            <div class="brand-title">PICHAYAMONGKOL CONSTRUCTION CO., LTD.</div>
            <div class="brand-subtitle">QC Checklist / รายงานตรวจควบคุมคุณภาพงานก่อสร้าง</div>
            <div class="company-address">276/1 ซอยพุทธบูชา 36 แขวงบางมด เขตทุ่งครุ กรุงเทพมหานคร 10140</div>
          </div>
        </div>
        <div class="doc-box">
          <div class="doc-label">Document No.</div>
          <div class="doc-no">${escapeHtml(checklist.document_no || "-")}</div>
          <div class="doc-date">Issued: ${escapeHtml(formatThaiDate(checklist.issued_at))}</div>
        </div>
      </header>
      <section class="title-block">
        <h1>รายงานตรวจควบคุมคุณภาพงานก่อสร้าง</h1>
        <div class="en">QC Checklist Approval Record</div>
      </section>
      <section class="summary-grid">
        <div class="summary-item"><div class="summary-label">โครงการ</div><div class="summary-value">${escapeHtml(project.name || project.project_id || "-")}</div></div>
        <div class="summary-item"><div class="summary-label">ลูกค้า</div><div class="summary-value">${escapeHtml(project.client || "-")}</div></div>
        <div class="summary-item full"><div class="summary-label">สถานที่</div><div class="summary-value">${escapeHtml(location || "-")}</div></div>
        <div class="summary-item"><div class="summary-label">หมวดงาน</div><div class="summary-value">${escapeHtml(checklist.category || "-")}</div></div>
        <div class="summary-item"><div class="summary-label">ช่วงงาน</div><div class="summary-value">${escapeHtml(checklist.phase || "-")}</div></div>
        <div class="summary-item full"><div class="summary-label">รายการตรวจ</div><div class="summary-value">${escapeHtml(checklist.title || "-")}</div></div>
        <div class="summary-item"><div class="summary-label">ผู้ตรวจ</div><div class="summary-value">${escapeHtml(checklist.inspected_by_name || "-")}</div></div>
        <div class="summary-item"><div class="summary-label">วันที่ตรวจ</div><div class="summary-value">${escapeHtml(formatThaiDate(checklist.inspection_date))}</div></div>
      </section>
      <section class="result-strip">
        <div class="metric"><strong>${counts.total}</strong><span>รายการทั้งหมด</span></div>
        <div class="metric"><strong>${counts.pass}</strong><span>ผ่าน</span></div>
        <div class="metric"><strong>${counts.repair + counts.fail}</strong><span>ต้องแก้ไข/ไม่ผ่าน</span></div>
        <div class="metric"><strong>${counts.pending}</strong><span>ยังไม่ตรวจ</span></div>
      </section>
      <div class="section-title">รายการตรวจสอบ</div>
      <table class="items">
        <thead>
          <tr><th style="width: 112px;">หมวดตรวจ</th><th>รายการตรวจ</th><th>เกณฑ์ยอมรับ</th><th class="result">ผล</th><th>หมายเหตุ</th></tr>
        </thead>
        <tbody>
          ${items.map((item) => `
            <tr>
              <td>${escapeHtml(item.section)}</td>
              <td><strong>${escapeHtml(item.title)}</strong></td>
              <td>${escapeHtml(item.acceptance)}</td>
              <td class="result">${escapeHtml(QC_RESULT_LABELS[item.result] || item.result || "-")}</td>
              <td>${escapeHtml(item.notes || "-")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <div class="notice">เอกสารนี้ใช้เป็นบันทึกการตรวจคุณภาพงานก่อสร้างและประกอบการอนุมัติจากลูกค้าก่อนดำเนินงานขั้นถัดไป</div>
      <section class="signatures">
        <div class="signature"><strong>ผู้ตรวจ / วิศวกรสนาม</strong><br />${escapeHtml(checklist.inspected_by_name || "")}<br />วันที่ ........../........../..........</div>
        <div class="signature"><strong>ผู้ควบคุมงาน</strong><br />วันที่ ........../........../..........</div>
        <div class="signature"><strong>ลูกค้า / ผู้อนุมัติ</strong><br />${escapeHtml(checklist.customer_approved_by || project.client || "")}<br />วันที่ ........../........../..........</div>
      </section>
      <footer class="footer">
        <span>Generated by PMC CONNEXT</span>
        <span>Page 1${images.length ? " / 2" : ""} | ${escapeHtml(resultSummary)}</span>
      </footer>
    </div>
  </main>
  ${images.length > 0 ? `
  <main class="page evidence-page">
    <div class="sheet">
      <section class="page-title">
        <div>
          <h1>หลักฐานแนบประกอบ QC</h1>
          <div class="brand-subtitle">${escapeHtml(project.name || project.project_id || "-")} | ${escapeHtml(checklist.document_no || "-")}</div>
        </div>
        <div class="doc-box">
          <div class="doc-label">Document No.</div>
          <div class="doc-no">${escapeHtml(checklist.document_no || "-")}</div>
        </div>
      </section>
      <div class="photo-grid">${images.slice(0, 6).map(renderImage).join("")}</div>
      <footer class="footer"><span>Generated by PMC CONNEXT</span><span>Page 2 / 2</span></footer>
    </div>
  </main>` : ""}
</body>
</html>`;
}
