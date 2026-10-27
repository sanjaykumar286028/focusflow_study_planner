const TOP_LEVEL = new Set(['version','profile','settings','tasks','schedule','sessions','notes','revisions','subjects','exams','goals','timer','ui']);
const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
const MAX_ITEMS = 2000;
const MAX_STRING = 5000;
const FORBIDDEN_KEYS = new Set(['__proto__','prototype','constructor']);

function validateTree(value, depth = 0, counter = { items: 0 }) {
  if (depth > 12) throw Error('Backup data is nested too deeply.');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    if (value.length > MAX_STRING) throw Error('A backup text field is too long.');
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) > 1e14) throw Error('Backup contains an invalid number.');
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ITEMS || (counter.items += value.length) > MAX_ITEMS * 4) throw Error('Backup contains too many records.');
    for (const entry of value) validateTree(entry, depth + 1, counter);
    return;
  }
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw Error('Backup contains an unsupported value.');
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw Error('Backup contains an unsafe property.');
    validateTree(entry, depth + 1, counter);
  }
}

export function parseBackup(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) throw Error('Backup files must be 5 MB or smaller.');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw Error('Could not read that JSON backup.'); }
  const source = parsed?.data ?? parsed;
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw Error('This is not a FocusFlow backup.');
  validateTree(source);
  if (source.version != null && ![1, 2].includes(source.version)) throw Error('This is not a supported FocusFlow backup.');
  if (!['tasks','schedule','notes','subjects'].every(key => Array.isArray(source[key]))) throw Error('This is not a supported FocusFlow backup.');
  for (const key of Object.keys(source)) if (!TOP_LEVEL.has(key)) delete source[key];
  const data = structuredClone(source);
  data.version = 2;
  for (const key of ['sessions','revisions','exams']) if (!Array.isArray(data[key])) data[key] = [];
  data.tasks.forEach((task, i) => { if (record(task)) { task.id ??= `import-task-${i}`; task.priority ??= 'medium'; task.completed ??= false; task.estimate ??= 30; task.dueDate ??= ''; task.description ??= ''; task.subject ??= ''; } });
  data.schedule.forEach((item, i) => { if (record(item)) { item.id ??= `import-session-${i}`; item.duration ??= 45; item.break ??= 5; item.time ??= ''; item.chapter ??= ''; item.topic ??= ''; } });
  data.notes.forEach((note, i) => { if (record(note)) { note.id ??= `import-note-${i}`; note.checklist ??= []; note.subject ??= ''; note.chapter ??= ''; note.topic ??= ''; note.body ??= ''; note.url ??= ''; } });
  data.subjects.forEach((subject, i) => { if (record(subject)) { subject.id ??= `import-subject-${i}`; subject.color ??= '#6357e8'; subject.chapters ??= []; } });
  data.subjects.filter(record).forEach(subject => subject.chapters.filter(record).forEach((chapter, i) => { chapter.id ??= `import-chapter-${i}`; chapter.topics ??= []; chapter.topics.filter(record).forEach((topic, j) => { topic.id ??= `import-topic-${i}-${j}`; topic.status ??= 'not-started'; }); }));
  for (const task of data.tasks) {
    if (!record(task) || !isText(task.title, 140) || !['low','medium','high'].includes(task.priority) || typeof task.completed !== 'boolean' || !integer(task.estimate, 1, 1440)) throw Error('Backup contains an invalid task.');
    optionalText(task, ['id','description','subject'], [100, 5000, 48]);
    if (task.dueDate && !validDate(task.dueDate)) throw Error('Backup contains an invalid task date.');
  }
  for (const item of data.schedule) {
    if (!record(item) || !isText(item.subject, 48) || !validDate(item.date) || !integer(item.duration, 1, 360) || !integer(item.break, 0, 60)) throw Error('Backup contains an invalid timetable entry.');
    optionalText(item, ['id','time','chapter','topic'], [100, 5, 120, 120]);
    if (item.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time)) throw Error('Backup contains an invalid time.');
  }
  for (const note of data.notes) {
    if (!record(note) || !isText(note.title, 120) || !Array.isArray(note.checklist)) throw Error('Backup contains an invalid note.');
    optionalText(note, ['id','subject','chapter','topic','body'], [100, 48, 100, 100, 5000]);
    if (note.url && (!isText(note.url, 2048) || !/^https?:\/\//i.test(note.url) || !safeUrl(note.url))) throw Error('Backup links must use HTTP or HTTPS.');
    for (const entry of note.checklist) if (!record(entry) || !isText(entry.text, 1200) || typeof entry.done !== 'boolean') throw Error('Backup contains an invalid checklist.');
  }
  for (const subject of data.subjects) {
    if (!record(subject) || !isText(subject.name, 48) || !/^#[\da-f]{6}$/i.test(subject.color) || !Array.isArray(subject.chapters)) throw Error('Backup contains an invalid subject.');
    optionalText(subject, ['id'], [100]);
    for (const chapter of subject.chapters) {
      if (!record(chapter) || !isText(chapter.title, 100) || !Array.isArray(chapter.topics)) throw Error('Backup contains an invalid chapter.');
      optionalText(chapter, ['id'], [100]);
      for (const topic of chapter.topics) if (!record(topic) || !isText(topic.title, 120) || !['not-started','in-progress','completed'].includes(topic.status)) throw Error('Backup contains an invalid syllabus topic.');
    }
  }
  for (const exam of data.exams) if (!record(exam) || !isText(exam.subject, 48) || !validDate(exam.date)) throw Error('Backup contains an invalid exam.');
  for (const revision of data.revisions) if (!record(revision) || !isText(revision.subject, 48) || !isText(revision.topic, 120) || !validDate(revision.due) || (revision.lastReview && !validDate(revision.lastReview)) || (revision.interval != null && !integer(revision.interval,1,30)) || (revision.step != null && !integer(revision.step,0,100))) throw Error('Backup contains an invalid revision.');
  for (const session of data.sessions) if (!record(session) || !validDate(session.date) || !integer(session.seconds, 0, 86400)) throw Error('Backup contains an invalid study session.');
  return data;
}

function record(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function isText(value, max) { return typeof value === 'string' && value.trim().length > 0 && value.length <= max; }
function integer(value, min, max) { return Number.isInteger(value) && value >= min && value <= max; }
function optionalText(item, keys, limits) { keys.forEach((key, i) => { if (item[key] != null && (typeof item[key] !== 'string' || item[key].length > limits[i])) throw Error('Backup contains an invalid text field.'); }); }
function validDate(value) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const d = new Date(`${value}T00:00:00Z`); return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0,10) === value; }
function safeUrl(value) { try { return ['http:','https:'].includes(new URL(value).protocol); } catch { return false; } }

export { MAX_BACKUP_BYTES };
