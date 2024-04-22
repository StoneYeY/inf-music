import { ChatInterface, GenerationConfig } from "@mlc-ai/web-llm";
import { MusicLogitProcessor } from "./music_logit_processor";

export type GenerationProgressCallback = (
  generated: number,
  total: number
) => void;

export class ChunkGenerator {
  genConfig?: GenerationConfig;
  pauseRequested: boolean = false;
  interruptRequested: boolean = false;

  setGenConfig(genConfig: GenerationConfig) {
    this.genConfig = genConfig;
  }

  setPause(pauseRequested: boolean = true) {
    this.pauseRequested = pauseRequested;
  }

  interrupt() {
    this.interruptRequested = true;
  }

  /**
   *
   * @param chat The ChatModule reloaded already.
   * @param musicLogitProcessor Music logit processor that resides in `chat` as well.
   * @yields First chunk has 1020 tokens, subsequent ones are 510 tokens.
   */
  async *chunkGenerate(
    chat: ChatInterface,
    musicLogitProcessor: MusicLogitProcessor,
    callback: GenerationProgressCallback
  ): AsyncGenerator<Array<number>, void, void> {
    // Generate first token
    let prompt: Array<number> = [55026];
    let nextToken = await chat.forwardTokensAndSample(
      prompt,
      /*isPrefill=*/ true,
      this.genConfig
    );
    let tokenToGenerate = 1020;
    let tokenGenerated = 0;

    // 1. Generate first 1020 tokens
    while (
      !this.interruptRequested &&
      musicLogitProcessor.tokenSequence.length < tokenToGenerate
    ) {
      nextToken = await chat.forwardTokensAndSample(
        [nextToken],
        /*isPrefill=*/ false,
        this.genConfig
      );

      tokenGenerated++;
      if (!this.pauseRequested) {
        callback(tokenGenerated, tokenToGenerate);
      }
    }

    if (this.interruptRequested) {
      musicLogitProcessor.resetState();
      yield Promise.reject("Interrupted");
      return;
    } else {
      yield Promise.resolve(musicLogitProcessor.tokenSequence);
    }

    tokenToGenerate = 510;
    tokenGenerated = 0;

    // 2. Take last 510 tokens, make it the new prompt, starting from time 0
    prompt = [...musicLogitProcessor.tokenSequence.slice(tokenToGenerate)];
    let startTime = prompt[0];
    for (let i = 0; i < tokenToGenerate; i += 3) {
      prompt[i] -= startTime;
    }
    prompt.unshift(55026); // Add the AUTOREGRESS prompt back in, making the prompt 511

    // 3. Clear KV cache and logitProcessor.tokenSequence
    chat.resetChat(/*keepStats=*/ true);

    // 4. Keep generating chunks of 510 tokens
    let cycles = 0; // Number of 510-token chunks generated after the first 1020 tokens
    while (!this.interruptRequested) {
      // TODO: change to a user-triggered stop
      let startTime = prompt[prompt.length - 3];

      // 4.1. Prefill prompt and get first token
      musicLogitProcessor.curTime = prompt[-3]; // Update curTime so `future_logits()` still work
      nextToken = await chat.forwardTokensAndSample(
        prompt,
        /*isPrefill=*/ true,
        this.genConfig
      );
      if (musicLogitProcessor.tokenSequence.length != 1) {
        throw Error("tokenSequence length should be 1 after prefill.");
      }

      // 4.2. Decode autoregressively
      tokenGenerated = 0;
      while (
        !this.interruptRequested &&
        musicLogitProcessor.tokenSequence.length < tokenToGenerate
      ) {
        nextToken = await chat.forwardTokensAndSample(
          [nextToken],
          /*isPrefill=*/ false,
          this.genConfig
        );
        tokenGenerated++;
        if (!this.pauseRequested) {
          callback(tokenGenerated, tokenToGenerate);
        }
      }

      // 4.3. Take all the tokenSequences (510 of tokens)
      prompt = [...musicLogitProcessor.tokenSequence]; // there are 510 newly generated tokens
      for (let i = 0; i < tokenToGenerate; i += 3) {
        prompt[i] -= startTime;
      }
      if (this.interruptRequested) {
        musicLogitProcessor.resetState();
        yield Promise.reject("Interrupted");
        return;
      } else {
        yield Promise.resolve(prompt);
      }
      prompt.unshift(55026); // Add the AUTOREGRESS prompt back in, making the prompt 511

      // 4.4. Clear KV cache and logitProcessor.tokenSequence
      chat.resetChat(/*keepStats=*/ true);
      cycles += 1;
    }
  }
}
