const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN!;
const LINE_GROUP_ID = process.env.LINE_GROUP_ID!;

export async function sendLineNotification(message: string, to: string = LINE_GROUP_ID) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    console.warn("LINE_CHANNEL_ACCESS_TOKEN is not set. Skipping notification.");
    return;
  }

  try {
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: to,
        messages: [
          {
            type: "text",
            text: message,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("LINE API Error:", errorData);
      throw new Error(`Failed to send LINE message: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error sending LINE notification:", error);
    throw error;
  }
}
