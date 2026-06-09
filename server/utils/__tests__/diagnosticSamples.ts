import type { SubtitleEntry } from '../../../types'

export const diagnosticSamples = {
  lyrics: {
    entries: [
      { id: '1', startTime: '00:00:01,902', endTime: '00:00:04,004', text: '♪' },
      { id: '14', startTime: '00:00:27,861', endTime: '00:00:30,198', text: '♪ dramatic music ♪' },
      { id: '30', startTime: '00:01:04,031', endTime: '00:01:06,267', text: '♪ pensive music ♪' }
    ] satisfies SubtitleEntry[]
  },
  nonDialogue: {
    entries: [
      { id: '15', startTime: '00:00:30,331', endTime: '00:00:31,665', text: '[train horn blows]' },
      { id: '23', startTime: '00:00:47,248', endTime: '00:00:49,049', text: '[sirens wailing]' },
      { id: '46', startTime: '00:01:45,406', endTime: '00:01:46,974', text: '[indistinct chatter]' }
    ] satisfies SubtitleEntry[]
  },
  multiLineDialogue: {
    entries: [
      { id: '13', startTime: '00:00:26,194', endTime: '00:00:27,761', text: "- I can't help you.\n- That's a shame." },
      { id: '17', startTime: '00:00:33,301', endTime: '00:00:35,336', text: '- decapitated these fuckers.\n- [Mike] Jesus.' },
      { id: '61', startTime: '00:02:17,805', endTime: '00:02:19,106', text: '- ♪ slow, suspenseful music\n- Shit.' }
    ] satisfies SubtitleEntry[]
  },
  longText: {
    entries: [
      { id: '31', startTime: '00:01:08,936', endTime: '00:01:11,905', text: 'I believe in Jesus Christ,\nHis only son, our Lord,' },
      { id: '32', startTime: '00:01:12,039', endTime: '00:01:14,074', text: 'conceived by the Holy Ghost,' },
      { id: '40', startTime: '00:01:29,557', endTime: '00:01:34,362', text: 'Our Father, who art in Heaven,\nhallowed be Thy Name.' }
    ] satisfies SubtitleEntry[]
  }
}
