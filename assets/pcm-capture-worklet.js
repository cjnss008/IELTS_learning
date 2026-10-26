'use strict';
// Raw microphone samples only. Output stays silent to avoid speaker feedback.
class IELTSPCMCapture extends AudioWorkletProcessor {
  constructor(){super();this.active=false;this.stopped=false;this.frames=0;this.maximumFrames=0;this.buffer=new Float32Array(2048);this.used=0;this.port.onmessage=event=>{if(event.data?.type==='start'&&!this.stopped){this.maximumFrames=Math.min(sampleRate*15,Math.max(1,Number(event.data.maximumFrames)||sampleRate*15));this.active=true;}else if(event.data?.type==='stop')this.finish();};}
  flush(){if(!this.used)return;const samples=this.buffer.slice(0,this.used);this.port.postMessage({type:'samples',samples},[samples.buffer]);this.used=0;}
  finish(){if(this.stopped)return;this.active=false;this.stopped=true;this.flush();this.port.postMessage({type:'stopped'});}
  process(inputs){if(this.stopped)return false;const channels=inputs[0];if(!this.active||!channels?.[0]?.length)return true;const length=Math.min(channels[0].length,this.maximumFrames-this.frames);for(let i=0;i<length;i++){let value=0;for(const channel of channels)value+=Number.isFinite(channel[i])?channel[i]:0;this.buffer[this.used++]=value/channels.length;if(this.used===this.buffer.length)this.flush();}this.frames+=length;if(this.frames>=this.maximumFrames)this.finish();return !this.stopped;}
}
registerProcessor('ielts-pcm-capture',IELTSPCMCapture);
