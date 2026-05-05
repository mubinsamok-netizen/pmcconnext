const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN!;
const LINE_GROUP_ID = process.env.LINE_GROUP_ID!;

type LineMessage = Record<string, unknown>;

export async function sendLineMessages(messages: LineMessage[], to: string = LINE_GROUP_ID) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    console.warn("LINE_CHANNEL_ACCESS_TOKEN is not set. Skipping notification.");
    return { skipped: true };
  }

  if (!to) {
    throw new Error("LINE group ID is not configured");
  }

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to,
      messages,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("LINE API Error:", errorData);
    throw new Error(`Failed to send LINE message: ${response.statusText}`);
  }

  return response.json();
}

export async function sendLineNotification(message: string, to: string = LINE_GROUP_ID) {
  try {
    return await sendLineMessages([{ type: "text", text: message }], to);
  } catch (error) {
    console.error("Error sending LINE notification:", error);
    throw error;
  }
}
