"""Deterministic role/paragraph layout for project-authored listening audio."""
import bisect
import hashlib
import html
import json
import re
import unicodedata

LAYOUT_VERSION = 'curriculum-role-pauses-v69-us-1'
PAUSES = {'paragraph': .8, 'speaker-change': .65, 'section': 1.0}
LABEL = re.compile(r'(?<![\w.])(?P<label>(?:(?:Dr|Mr|Mrs|Ms|Prof)\.?[ \t]+[A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+)?|(?:Student|Speaker|STUDENT|SPEAKER)[ \t]*[A-Z0-9]+|[A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+){0,2}|[A-Z]{1,16}(?:[ \t]+[A-Z]{1,20}){0,2})):[ \t]*')
NARRATION = re.compile(r'^(?:narrator|narration)$', re.I)
# Reviewed speaker labels in the fixed authored curriculum. A colon and title
# case alone cannot distinguish a person from "Listening:" or "Include:".
# Unknown labels stay verbatim spoken text; new roles must be registered.
ROLE_NAMES = frozenset('''Mia|Tom|Tutor|Ben|Mei|Woman|Man|Anna|Leo|Maya|Daniel|Li Wei|Sarah|Maria|Host|Guide|David|Receptionist|Caller|Lisa|Owen|Sam|Liam|James|Librarian|Reader|Nina|Mark|Li Ming|Lily|Student|Li|Rosa|Dan|Visitor|Wang|Jo|Jun|Grandma|Lecturer|Chair|Ana|Lucy|Teacher|Omar|Leah|Curator|Eli|Ravi|Lena|Jon|Alex|Iris|Noah|Adviser|Laura|John|Dad|Sara|Learner|Speaker|Leila|Marcus|Priya|Chen|Lin|Claire|Mary|Grandpa|Question|Answer|Male|Female'''.casefold().split('|'))


def speaker_label(label, inferred=frozenset()):
    key = role_key(label)
    return bool(NARRATION.fullmatch(label) or key in ROLE_NAMES or key in inferred or key in {'a', 'b', 'm', 'w', 'f'} or re.fullmatch(r'(?:student|speaker)\s*[a-z0-9]+', key) or re.fullmatch(r'(?:dr|mr|mrs|ms|prof) [a-z]+(?: [a-z]+)?', key))


def speaker_marker(match, line, inferred=frozenset()):
    if not speaker_label(match['label'], inferred): return False
    prefix, key = line[:match.start()].rstrip(), role_key(match['label'])
    # "Ben: Hello. I am Ben: B, E, N." contains one speaker label. Named
    # inline turns need a sentence boundary; explicit A/B turns also support
    # the compact "A: Hi B: Hello" authoring form.
    return not prefix or key in {'a', 'b', 'm', 'w', 'f'} or bool(re.search(r'''[.!?]["'\u201d\u2019)]*$''', prefix))


def sha(value):
    return hashlib.sha256(value.encode('utf-8') if isinstance(value, str) else value).hexdigest()


def normalized(value):
    return ''.join(c.casefold() for c in unicodedata.normalize('NFKC', html.unescape(value)) if c.isalnum())


def role_key(label):
    return re.sub(r'[.\s]+', ' ', label).strip().casefold()



NON_SPEAKERS = frozenset('''Listening|Reading|Writing|Speaking|Vocabulary|Grammar|Section|Part|Pause|Topic|Task|Instructions|Instruction|Answer Key|Complete|Include|Note|Notes|Example|Sample Answer|Introduction|Summary|Conclusion|Total|Questions|Practice|Stage Check|Academic Listening|Listening Passage|Listening Transcript|Transcript|Narrative|Main Point|First|Second|Third|Step|Steps|Stage|Activity|Option|Form|Title|Speaker Labels|Audio|Library Orientation|Garden Project|Garden Meeting|Garden Workshop|Writing Workshop|Simple Map|Checking Progress|Peer Review|Simulated Lecture|Group Project|Simulated Listening|Fast Fashion|Phase Assessment|Silent Library|Speculation|Comparison|Quantifiers|Tense|Art Project|Timed Writing|Timed Essay|Independent Listening|Microphone|King Street|Queen Street|Up'''.casefold().split('|'))
DIALOGUE_OPENING = re.compile(r"^(?:hello|hi|good\b|i\b|i['’]m|we\b|our\b|you\b|your\b|thank|yes\b|no\b|can\b|could\b|please|excuse|sorry|that|this|the\b|let|it\b|how|what|when|where|why|would|will|may|welcome|sure|right|exactly|okay|ok\b|well|today|my\b|there)\b", re.I)

def inferred_roles(text):
    """Infer anchored human names in dialogue without treating prose headings as roles."""
    candidates, known = {}, 0
    for line in text.splitlines():
        match = LABEL.match(line.lstrip())
        if not match: continue
        label, key = match['label'], role_key(match['label'])
        if speaker_label(label):
            known += 1
            continue
        if key in NON_SPEAKERS or re.match(r'^(?:section|part|pause|task|track|chapter|unit|lesson|exercise|instruction|question|answer key|example)\b', key): continue
        if not re.fullmatch(r'(?:[A-Z][a-z]+|[A-Z]{2,20})(?:[ \t]+(?:[A-Z][a-z]+|[A-Z]{2,20})){0,2}', label): continue
        count, spoken = candidates.get(key, (0, False))
        content = line.lstrip()[match.end():].lstrip()
        candidates[key] = (count + 1, spoken or bool(DIALOGUE_OPENING.match(content)))
    distinct = known + len(candidates)
    return {key for key, (count, spoken) in candidates.items() if count >= 2 or distinct >= 2 and spoken}

def layout(text, pair, narrator_voice, alternate_pair):
    if not isinstance(text, str) or not text.strip():
        raise ValueError('A nonempty original transcript is required')
    inferred = inferred_roles(text)
    segments, roles, labels, current, offset, paragraph_break = [], {}, [], 'narrator', 0, False

    def append(start, end, key, label, boundary):
        while start < end and text[start].isspace(): start += 1
        while end > start and text[end - 1].isspace(): end -= 1
        if start == end: return
        segments.append({'role': key, 'speaker': label, 'sourceStart': start, 'sourceEnd': end, 'text': text[start:end], 'boundary': boundary})

    for raw in text.splitlines(keepends=True):
        line = raw.rstrip('\r\n')
        if not line.strip():
            paragraph_break = True; offset += len(raw); continue
        matches = [match for match in LABEL.finditer(line) if speaker_marker(match, line, inferred)]
        if not matches:
            if paragraph_break: current = 'narrator'
            append(offset, offset + len(line), current, roles.get(current, 'Narrator'), 'paragraph')
        else:
            if matches[0].start():
                if paragraph_break: current = 'narrator'
                append(offset, offset + matches[0].start(), current, roles.get(current, 'Narrator'), 'paragraph')
            for index, match in enumerate(matches):
                label = match['label']; current = 'narrator' if NARRATION.fullmatch(label) else role_key(label)
                labels.append({'label': label, 'role': current, 'sourceStart': offset + match.start(), 'sourceEnd': offset + match.end()})
                if current != 'narrator': roles.setdefault(current, label)
                end = matches[index + 1].start() if index + 1 < len(matches) else len(line)
                append(offset + match.end(), offset + end, current, 'Narrator' if current == 'narrator' else roles[current], 'section' if current == 'narrator' else 'turn')
        paragraph_break = False; offset += len(raw)

    # Speaker identity is bound to its normalized label, never segment parity.
    pool = list(dict.fromkeys([*pair, *alternate_pair])); assigned = {}
    neighbours = {key: set() for key in roles}
    for before, after in zip(segments, segments[1:]):
        left, right = before['role'], after['role']
        if left != right and left in neighbours and right in neighbours:
            neighbours[left].add(right); neighbours[right].add(left)
    for key in roles:
        preferred = pair[1] if key in {'b', 'm', 'man', 'male', 'answer'} else pair[0] if key in {'a', 'w', 'f', 'woman', 'female', 'question'} else None
        available = [voice for voice in pool if voice not in {assigned[other] for other in neighbours[key] if other in assigned}]
        if not available: raise ValueError('Dialogue needs an additional distinct registered voice')
        unused = [voice for voice in available if voice not in assigned.values()]
        rotation = pool[len(assigned) % len(pool):] + pool[:len(assigned) % len(pool)]
        assigned[key] = preferred if preferred in available else unused[0] if unused else next(voice for voice in rotation if voice in available)
    assigned['narrator'] = narrator_voice if roles else pair[0]
    for index, segment in enumerate(segments):
        segment['voice'] = assigned[segment['role']]
        segment['textHash'] = sha(segment['text'])
        segment['pauseBeforeSeconds'] = 0 if index == 0 else PAUSES['section'] if segment['boundary'] == 'section' else PAUSES['speaker-change'] if segments[index - 1]['role'] != segment['role'] else PAUSES['paragraph']
    covered = [0] * len(text)
    for span in [*labels, *segments]:
        for position in range(span['sourceStart'], span['sourceEnd']): covered[position] += 1
    if any(not character.isspace() and covered[position] != 1 for position, character in enumerate(text)): raise ValueError('Original transcript characters are missing or overlap')
    return {'version': LAYOUT_VERSION, 'roleVoices': assigned, 'sourceLabels': labels, 'segments': segments}


def with_role_voices(planned, overrides=None):
    """Apply explicit authored US voices without changing source/timing spans."""
    if overrides is None or overrides == {}:
        return planned
    if not isinstance(overrides, dict):
        raise ValueError('Role voices must be a named-role mapping')
    roles = dict(planned['roleVoices'])
    for role, voice in overrides.items():
        if role not in roles:
            raise ValueError('Unknown authored speaker role: ' + str(role))
        if not isinstance(voice, str) or not re.fullmatch(r'en-US-[A-Za-z0-9]+Neural', voice):
            raise ValueError('Explicit role voices must be American en-US neural voices')
        roles[role] = voice
    if len(set(roles.values())) != len(roles):
        raise ValueError('Explicit role voices must keep each speaker and narrator distinct')
    return {**planned, 'roleVoices': roles, 'segments': [{**segment, 'voice': roles[segment['role']]} for segment in planned['segments']]}


def configuration(text, planned, rate, package_version):
    value = {'layoutVersion': LAYOUT_VERSION, 'transcriptHash': sha(text), 'rate': rate, 'format': 'mp3-24000-mono-48k', 'authoringPackageVersion': package_version, 'roleVoices': planned['roleVoices'], 'sourceLabels': planned['sourceLabels'], 'segments': planned['segments']}
    return value, sha(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')))


def align_boundaries(texts, boundaries):
    """Assign actual service word times only after a complete lexical match."""
    lengths, total = [], 0
    for text in texts:
        count = len(normalized(text))
        if not count: raise ValueError('A speech segment has no lexical content')
        total += count; lengths.append(total)
    expected = ''.join(normalized(text) for text in texts); cursor = 0; result = [None] * len(texts)
    for word in boundaries:
        token = normalized(word['text'])
        if not token: continue
        if not expected.startswith(token, cursor): raise ValueError('Service word boundaries do not exactly match the planned text')
        index = bisect.bisect_right(lengths, cursor)
        if index >= len(texts) or cursor + len(token) > lengths[index]: raise ValueError('A word boundary crosses a source segment')
        start, end = word['offset'] / 10000000, (word['offset'] + word['duration']) / 10000000
        if start < 0 or end < start or result[index] and start < result[index]['endSeconds'] - .02: raise ValueError('Invalid or overlapping real word times')
        if result[index] is None: result[index] = {'startSeconds': start, 'endSeconds': end}
        else: result[index]['endSeconds'] = end
        cursor += len(token)
    if cursor != len(expected) or any(item is None for item in result): raise ValueError('Incomplete service word-boundary coverage')
    return result
