import * as webllm from "@mlc-ai/web-llm";
import { CustomRequestParams, WorkerMessage } from "@mlc-ai/web-llm";
import { AUTOREGRESS } from "./music_transformer_vocab";

function setLabel(id: string, text: string) {
  const label = document.getElementById(id);
  if (label == null) {
    throw Error("Cannot find label " + id);
  }
  label.innerText = text;
}

// Define modelRecord
const myAppConfig: webllm.AppConfig = {
  model_list: [
    {
      "model_url": "https://huggingface.co/mlc-ai/mlc-chat-stanford-crfm-music-medium-800k-q0f32-MLC/resolve/main/",
      "model_id": "music-medium-800k-q0f32",
      "model_lib_url": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/music-medium-800k/music-medium-800k-q0f32-webgpu.wasm",
    },
    {
      "model_url": "https://huggingface.co/mlc-ai/mlc-chat-stanford-crfm-music-small-800k-q0f32-MLC/resolve/main/",
      "model_id": "music-small-800k-q0f32",
      "model_lib_url": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/music-small-800k/music-small-800k-q0f32-webgpu.wasm",
    },
  ]
};

export class CustomChatWorkerClient extends webllm.ChatWorkerClient {
  constructor(worker: any) {
    super(worker);
    worker.onmessage = (event: any) => {
      this.onmessage(event);
    }
  }

  async chunkGenerate(genConfig?: webllm.GenerationConfig): Promise<string> {
    const msg: webllm.WorkerMessage = {
      kind: "customRequest",
      uuid: crypto.randomUUID(),
      content: {
        requestName: "chunkGenerate",
        requestMessage: JSON.stringify(genConfig)
      }
    };
    return await this.getPromise<string>(msg);
  }

  async resetGenerator(prompt?: number[]): Promise<void> {
    // Only take the last 510 tokens as the prompt
    let tokens = prompt || [];
    tokens = tokens.slice(Math.max(tokens.length - 510, 0));
    const msg: webllm.WorkerMessage = {
      kind: "customRequest",
      uuid: crypto.randomUUID(),
      content: {
        requestName: "resetGenerator",
        requestMessage: tokens.join()
      }
    };
    await this.getPromise<null>(msg);
  }

  async stopGenerator(): Promise<void> {
    const msg: webllm.WorkerMessage = {
      kind: "customRequest",
      uuid: crypto.randomUUID(),
      content: {
        requestName: "interrupt",
        requestMessage: ""
      }
    };
    await this.getPromise<null>(msg);
  }

  async restartGenerator(): Promise<void> {
    const msg: webllm.WorkerMessage = {
      kind: "customRequest",
      uuid: crypto.randomUUID(),
      content: {
        requestName: "restart",
        requestMessage: ""
      }
    };
    await this.getPromise<null>(msg);
  }

  async selectInstrument(instrument: string): Promise<void> {
    const msg: webllm.WorkerMessage = {
      kind: "customRequest",
      uuid: crypto.randomUUID(),
      content: {
        requestName: "selectInstrument",
        requestMessage: instrument
      }
    };
    await this.getPromise<null>(msg);
  }

  onmessage(event: MessageEvent<any>): void {
    const msg = event.data as WorkerMessage;
    switch (msg.kind) {
      case "customRequest": {
        const params = msg.content as CustomRequestParams;
        if (params.requestName == 'generationRequestCallback') {
          setLabel("init-label", params.requestMessage);
        }
        return;
      }
      default:
        super.onmessage(event);
    }
  }
}

export async function initChat(model_id?: string) {
  const chat = new CustomChatWorkerClient(new Worker(
    new URL('./worker.ts', import.meta.url),
    { type: 'module' }
  ));

  chat.setInitProgressCallback((report: webllm.InitProgressReport) => {
    setLabel("init-label", report.text);
  });

  if (model_id === undefined) {
    model_id = "music-small-800k-q0f32";
  }

  // Reload chat module with a logit processor
  await chat.reload(model_id, undefined, myAppConfig);

  return chat;
}

export async function reloadChat(chat: webllm.ChatWorkerClient, model_id: string) {
  await chat.reload(model_id, undefined, myAppConfig);
}