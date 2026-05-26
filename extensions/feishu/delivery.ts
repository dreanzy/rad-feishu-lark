import { loadConfig } from "./config.js";
import { debugLog } from "./debug.js";
import type { FeishuRoute } from "./types.js";
import type { FeishuTransport } from "./transport.js";

export class FeishuDelivery {
  private sdkClient: any;

  constructor(private readonly getTransport: () => FeishuTransport | undefined) {}

  async send(route: FeishuRoute, text: string) {
    const transport = this.getTransport();
    if (transport?.isRunning()) {
      if (route.threadMessageId) await transport.replyText(route.threadMessageId, text);
      else await transport.sendText(route.chatId, text);
      return;
    }

    await this.ensureClient();
    if (route.threadMessageId) await this.replyText(route.threadMessageId, text);
    else await this.sendText(route.chatId, text);
  }

  private async ensureClient() {
    if (this.sdkClient) return;
    const cfg = loadConfig();
    if (!cfg) throw new Error("Missing Feishu config");
    const lark = await import("@larksuiteoapi/node-sdk");
    const domain = cfg.domain === "lark" ? lark.Domain.Lark : lark.Domain.Feishu;
    this.sdkClient = new lark.Client({
      appId: cfg.appId,
      appSecret: cfg.appSecret,
      appType: lark.AppType.SelfBuild,
      domain,
      loggerLevel: lark.LoggerLevel.error,
    });
  }

  private async replyText(messageId: string, text: string) {
    debugLog("feishu.bridge.reply", { messageId, length: text.length });
    for (const chunk of splitText(text, 3500)) {
      await this.sdkClient.im.message.reply({
        path: { message_id: messageId },
        data: { msg_type: "text", content: JSON.stringify({ text: chunk }) },
      });
    }
  }

  private async sendText(chatId: string, text: string) {
    debugLog("feishu.bridge.send", { chatId, length: text.length });
    for (const chunk of splitText(text, 3500)) {
      await this.sdkClient.im.message.create({
        params: { receive_id_type: "chat_id" },
        data: {
          receive_id: chatId,
          msg_type: "text",
          content: JSON.stringify({ text: chunk }),
        },
      });
    }
  }
}

function splitText(text: string, max: number) {
  const out: string[] = [];
  let rest = text.trim() || "(empty response)";
  while (rest.length > max) {
    out.push(rest.slice(0, max));
    rest = rest.slice(max);
  }
  out.push(rest);
  return out;
}
