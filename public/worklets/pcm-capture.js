// AudioWorklet: microphone → 16-bit PCM at the target rate (24 kHz for Grok
// Voice), in ~40 ms chunks posted to the main thread, plus a level meter.
// Resamples with linear interpolation because browsers capture at the
// device rate (usually 48 kHz) and Firefox can't mix context sample rates.
class PcmCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const target = (options.processorOptions && options.processorOptions.targetRate) || 24000;
    this.step = sampleRate / target; // input samples per output sample
    this.chunk = new Int16Array(Math.round(target * 0.04));
    this.filled = 0;
    this.pos = 0; // read position into the current input block (may be < 0: between blocks)
    this.last = 0; // last sample of the previous block
    this.levelSum = 0;
    this.levelCount = 0;
    this.muted = false;
    this.port.onmessage = (e) => {
      if (e.data && typeof e.data.muted === "boolean") this.muted = e.data.muted;
    };
  }

  emit(sample) {
    const s = this.muted ? 0 : Math.max(-1, Math.min(1, sample));
    this.chunk[this.filled++] = s < 0 ? s * 0x8000 : s * 0x7fff;
    this.levelSum += s * s;
    this.levelCount++;
    if (this.filled === this.chunk.length) {
      const out = this.chunk.slice(0);
      this.port.postMessage({ pcm: out.buffer, level: Math.sqrt(this.levelSum / this.levelCount) }, [out.buffer]);
      this.filled = 0;
      this.levelSum = 0;
      this.levelCount = 0;
    }
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input || input.length === 0) return true;
    while (this.pos < input.length - 1) {
      const i = Math.floor(this.pos);
      const frac = this.pos - i;
      const a = i < 0 ? this.last : input[i];
      const b = input[i + 1];
      this.emit(a + (b - a) * frac);
      this.pos += this.step;
    }
    this.pos -= input.length;
    this.last = input[input.length - 1];
    return true;
  }
}

registerProcessor("pcm-capture", PcmCapture);
