export async function fetchPaymentRequests(url: string) {
  const response = await fetch(url, { headers: { "X-PMC-No-Global-Loading": "1" } });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || "โหลดข้อมูลเบิกเงินไม่สำเร็จ");
  return result;
}
