export type SampleId = 'fr' | 'err' | 'hi';
export type Action = 'explain' | 'translate';

interface Answer {
  title: string;
  answer: string;
}
interface Sample {
  text: string;
  lang: string;
  explain: Answer;
  translate: Answer;
}

/** Real Tito answers (Gemini and the offline Hindi pack), kept as samples for the live demo. */
export const SAMPLES: Record<SampleId, Sample> = {
  fr: {
    text: 'Où est la bibliothèque, s’il vous plaît ?',
    lang: 'fr',
    explain: { title: 'A French question', answer: 'It means “Where is the library, please?” A polite way to ask for directions.' },
    translate: { title: 'Hindi translation', answer: 'पुस्तकालय कहाँ है, कृपया?' },
  },
  err: {
    text: "TypeError: Cannot read properties of undefined (reading 'map')",
    lang: 'en',
    explain: { title: 'A JavaScript error', answer: 'Your variable is undefined when .map runs. Give it a default array, or check it first with items?.map(...).' },
    translate: { title: 'Hindi translation', answer: 'टाइप त्रुटि: अपरिभाषित (undefined) की प्रॉपर्टी ‘map’ पढ़ी नहीं जा सकती।' },
  },
  hi: {
    text: 'मैं कल दिल्ली जा रहा हूँ।',
    lang: 'hi',
    explain: { title: 'A Hindi sentence', answer: 'It says: “I am going to Delhi tomorrow.”' },
    translate: { title: 'English translation', answer: 'I am going to Delhi tomorrow.' },
  },
};
