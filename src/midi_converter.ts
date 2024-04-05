/**
 * Convert raw data to notes data.
 * Raw output is a sequence of triplet  time, duration, and note (t, d, n).
 * Note n combines pitch p and instrument k using a single value n = 128k + p.
 */
import MidiWriter from 'midi-writer-js'; // https://grimmdude.com/MidiWriterJS/docs/modules.html
import { MAX_PITCH } from './music_transformer_config'
import { DUR_OFFSET, NOTE_OFFSET, CONTROL_OFFSET } from './music_transformer_vocab';
import { channel } from 'process';

const VELOCITY = 72
const BEAT = 2;

function offset(num) {
  if (num >= CONTROL_OFFSET) return num - CONTROL_OFFSET;
  return num;
}

/**
 * Convert each triplet in raw data into a note with 5 pieces of info. 
 * Conversion method see github.com/jthickstun/anticipation/blob/main/anticipation/convert.py.
 * Output is a list of list of numbers, where each inner list is a note formatted as 
 * [start, duration, pitch, instrument, velocity]. Start time and duration in unit of seconds.
 */
export function eventsToCompound(rawData: number[], start_offset: number = 0): number[][] {
  const notesData: number[][] = [];

  /* Iterate through each 3 note triplet. */
  for (let i = 0; i < rawData.length; i += 3) {
    const start = offset(rawData[i]) + start_offset;
    const duration = offset(rawData[i + 1]) - DUR_OFFSET;
    const pitch = (offset(rawData[i + 2]) - NOTE_OFFSET) % MAX_PITCH;
    const instrument = Math.floor((offset(rawData[i + 2]) - NOTE_OFFSET) / MAX_PITCH);
    notesData.push([start, duration, pitch, instrument, VELOCITY]);
  }

  return notesData;
}

export function compoundToMidi(notesData: number[][]): string {
  /**
   * Create one midi track for each instrument.
   * Output map key/pair set: <Instrument midi class, track for that instrument >.
   */
  var num_tracks = 0
  const instruMap = new Map<number, [any, number]>();
  for (let i = 0; i < notesData.length; i++) {
    const [start, duration, pitch, instrument, velocity] = notesData[i];

    /* If we get encounter a new instrument, add a new MIDI track for it. */
    if (!instruMap.has(instrument)) {
      var idx: number = num_tracks;
      const track = new MidiWriter.Track();
      if (instrument == 128) { // drums always go on channel 9
        idx = 9;
        track.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: 0, channel: idx }));
      } else {
        track.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: instrument, channel: idx }));
      }
      instruMap.set(instrument, [track, idx]);
      num_tracks += 1
      if (num_tracks == 9) {
        num_tracks += 1 // skip the drums track
      }
    }
    
    const elem = instruMap.get(instrument);
    if (elem === undefined) {
      throw Error("Shouldn't happen!");
    }
    const track = elem[0];
    const channel = elem[1];
    // https://github.com/grimmdude/MidiWriterJS/blob/master/src/midi-events/note-event.ts
    const note = new MidiWriter.NoteEvent({
      pitch: pitch, velocity: velocity,
      tick: start, duration: `T${duration}`,
      channel: channel
    });
    track.addEvent(note);
  }

  /* Download file. */
  const writer = new MidiWriter.Writer(Array.from(instruMap.values()).map(v => v[0]));
  return writer.dataUri();
}