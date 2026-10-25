"""Authoring-only tests; no real TTS requests or learner configuration."""
import asyncio
import copy
import importlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from curriculum_audio_layout import align_boundaries, configuration, layout, normalized, sha

PAIR = ('voice-a', 'voice-b')


class LayoutTests(unittest.TestCase):
    def planned(self, text):
        return layout(text, PAIR, 'voice-narrator', ('voice-c', 'voice-d'))

    def test_inline_and_newline_roles_remain_fixed_not_alternating(self):
        text = 'A: Hello. B: Good morning. A: I need a ticket.\nA: A return ticket.\nB: Here you are.'
        plan = self.planned(text)
        self.assertEqual([s['voice'] for s in plan['segments']], ['voice-a', 'voice-b', 'voice-a', 'voice-a', 'voice-b'])
        self.assertEqual([s['text'] for s in plan['segments']], ['Hello.', 'Good morning.', 'I need a ticket.', 'A return ticket.', 'Here you are.'])
        self.assertEqual([s['label'] for s in plan['sourceLabels']], ['A', 'B', 'A', 'A', 'B'])
        self.assertEqual([s['pauseBeforeSeconds'] for s in plan['segments']], [0, .65, .65, .8, .65])
        for segment in plan['segments']:
            self.assertEqual(text[segment['sourceStart']:segment['sourceEnd']], segment['text'])
            self.assertEqual(sha(segment['text']), segment['textHash'])
        without_punctuation = self.planned('A: Hi B: Hello A: Again')
        self.assertEqual([s['text'] for s in without_punctuation['segments']], ['Hi', 'Hello', 'Again'])

    def test_named_role_case_and_punctuation_have_one_identity_and_narrator_is_separate(self):
        text = 'Listen to this conversation.\nTutor: Please begin.\nMIA: My first point.\nNarrator: A short pause.\nTUTOR: Thank you.\nDr. Chen: My answer.\nDr Chen: My other answer.'
        plan = self.planned(text); voices = plan['roleVoices']
        self.assertEqual(plan['segments'][0]['voice'], 'voice-narrator')
        self.assertEqual(plan['segments'][3]['voice'], 'voice-narrator')
        self.assertEqual(plan['segments'][1]['voice'], plan['segments'][4]['voice'])
        self.assertEqual(plan['segments'][5]['voice'], plan['segments'][6]['voice'])
        self.assertNotEqual(voices['narrator'], voices['tutor'])
        self.assertNotEqual(voices['narrator'], voices['mia'])

    def test_paragraphs_receive_real_planned_gaps_and_lowercase_prose_colons_are_not_roles(self):
        text = 'There is a second principle: choose evidence.\n\nOne important thing: check the source.'
        plan = self.planned(text)
        self.assertEqual(len(plan['segments']), 2)
        self.assertEqual(set(s['role'] for s in plan['segments']), {'narrator'})
        self.assertEqual(plan['segments'][1]['pauseBeforeSeconds'], .8)
        self.assertEqual(plan['segments'][0]['voice'], 'voice-a')

    def test_titles_and_capitalized_prose_are_spoken_verbatim_not_invented_roles(self):
        text = "Section 1: Week 52 Listening: Annual Review\n\nMia: Include: check articles.\nTom: It says 'Microphone: On'.\n\nSection 4: The Art of the Follow-Up: Extending Answers"
        plan = self.planned(text)
        self.assertEqual([s['label'] for s in plan['sourceLabels']], ['Mia', 'Tom'])
        self.assertEqual([s['text'] for s in plan['segments']], ["Section 1: Week 52 Listening: Annual Review", "Include: check articles.", "It says 'Microphone: On'.", "Section 4: The Art of the Follow-Up: Extending Answers"])
        self.assertEqual(set(plan['roleVoices']), {'narrator', 'mia', 'tom'})
        known = self.planned('Speaker 1: First. Speaker 2: Second.\nW: A question.\nM: An answer.')
        self.assertEqual([s['speaker'] for s in known['segments']], ['Speaker 1', 'Speaker 2', 'W', 'M'])
        self.assertEqual(known['roleVoices']['w'], 'voice-a')
        self.assertEqual(known['roleVoices']['m'], 'voice-b')

    def test_role_voice_reuse_never_collides_at_a_speaker_change(self):
        plan = self.planned('A: First. B: Second. Tutor: Third. Leo: Fourth. Jun: Fifth. A: Again. Jun: Another answer.')
        for before, after in zip(plan['segments'], plan['segments'][1:]):
            if before['role'] != after['role']: self.assertNotEqual(before['voice'], after['voice'])
        self.assertEqual(plan['segments'][4]['voice'], plan['segments'][6]['voice'])

    def test_a_speaker_name_used_in_spelling_prose_is_not_silently_removed(self):
        plan = self.planned('Ben: Hello. I am Ben: B, E, N.\nMia: Nice to meet you. Ben: Thank you.')
        self.assertEqual([s['label'] for s in plan['sourceLabels']], ['Ben', 'Mia', 'Ben'])
        self.assertEqual([s['text'] for s in plan['segments']], ['Hello. I am Ben: B, E, N.', 'Nice to meet you.', 'Thank you.'])

    def test_config_changes_with_voice_rate_pause_or_text_even_when_old_transcript_hash_matches(self):
        text = 'A: Hello. B: Hello again.'; plan = self.planned(text)
        config, first = configuration(text, plan, '-15%', '7.3.1')
        self.assertEqual(first, configuration(text, plan, '-15%', '7.3.1')[1])
        changed = copy.deepcopy(plan); changed['segments'][1]['pauseBeforeSeconds'] = 1.2
        self.assertNotEqual(first, configuration(text, changed, '-15%', '7.3.1')[1])
        changed['segments'][1]['voice'] = 'voice-different'
        self.assertNotEqual(first, configuration(text, changed, '-15%', '7.3.1')[1])
        self.assertNotEqual(first, configuration(text, plan, '-5%', '7.3.1')[1])
        self.assertEqual(config['transcriptHash'], sha(text))

    def test_word_positions_require_complete_actual_service_evidence(self):
        boundaries = [{'text': 'We', 'offset': 0, 'duration': 1000000}, {'text': 'read', 'offset': 1000000, 'duration': 2000000}, {'text': 'books', 'offset': 10000000, 'duration': 3000000}]
        result = align_boundaries(['We read.', 'Books.'], boundaries)
        self.assertEqual(result, [{'startSeconds': 0, 'endSeconds': .3}, {'startSeconds': 1, 'endSeconds': 1.3}])
        for broken in [boundaries[:-1], [{**boundaries[0], 'text': 'They'}, *boundaries[1:]], [*boundaries, boundaries[-1]]]:
            with self.assertRaises(ValueError): align_boundaries(['We read.', 'Books.'], broken)
        self.assertEqual(normalized('don’t &amp; CAN\'T'), 'dontcant')


class PublicationTests(unittest.IsolatedAsyncioTestCase):
    async def test_unchanged_validated_voice_groups_survive_layout_policy_revision_only(self):
        author = importlib.import_module('curriculum_audio_authoring')
        with tempfile.TemporaryDirectory(prefix='ielts-audio-request-cache-') as folder:
            cache = Path(folder)
            identity = {'text': 'Hello.\n\nAgain.', 'voice': 'voice-a', 'rate': '-15%', 'boundary': 'WordBoundary', 'packageVersion': author.VERSION, 'version': 'curriculum-role-pauses-v68-2'}
            key = sha(json.dumps(identity, ensure_ascii=False, sort_keys=True, separators=(',', ':')))
            original = b'original verified group'
            (cache / (key + '.mp3')).write_bytes(original)
            meta = {'identity': identity, 'audioHash': sha(original), 'wordBoundaries': [{'text': 'Hello', 'offset': 0, 'duration': 1000000}, {'text': 'Again', 'offset': 2000000, 'duration': 1000000}]}
            (cache / (key + '.json')).write_text(json.dumps(meta), encoding='utf-8')
            with mock.patch.object(author, 'CACHE', cache), mock.patch.object(author, 'pcm', return_value=b'\0\0' * 100), mock.patch.object(author.edge_tts, 'Communicate', side_effect=RuntimeError('network not allowed')) as network, mock.patch.object(author.asyncio, 'sleep', new=mock.AsyncMock()):
                output = await author.voice_group(['Hello.', 'Again.'], 'voice-a', '-15%')
                self.assertEqual(output[0], key); self.assertTrue(output[-1]); network.assert_not_called()
                with self.assertRaisesRegex(RuntimeError, 'network not allowed'):
                    await author.voice_group(['Hello.', 'Changed.'], 'voice-a', '-15%')
                self.assertEqual(network.call_count, 3)
            self.assertEqual((cache / (key + '.mp3')).read_bytes(), original)

    async def test_failed_synthesis_preserves_original_audio_and_metadata(self):
        author = importlib.import_module('curriculum_audio_authoring')
        with tempfile.TemporaryDirectory(prefix='ielts-audio-authoring-') as folder:
            root = Path(folder); out, meta, work = root / 'audio', root / 'meta', root / 'work'
            for directory in [out, meta, work]: directory.mkdir()
            material = {'id': 'fixture-listening', 'week': 1, 'skill': 'listening', 'audioSynthetic': True, 'transcript': 'A: Hello. B: Good morning.'}
            source = root / 'material.json'; source.write_text(json.dumps(material), encoding='utf-8')
            target, metadata = out / 'fixture-listening.mp3', meta / 'fixture-listening.json'
            target.write_bytes(b'ORIGINAL-UNTOUCHED-MP3'); metadata.write_text('{"configurationHash":"old"}', encoding='utf-8')
            old_audio, old_meta = target.read_bytes(), metadata.read_bytes()
            with mock.patch.multiple(author, OUT=out, META=meta, WORK=work, CACHE=work / 'groups'), mock.patch.object(author, 'voice_group', new=mock.AsyncMock(side_effect=RuntimeError('Isolated upstream failure'))):
                with self.assertRaises(RuntimeError): await author.generate(source, asyncio.Semaphore(1), {})
            self.assertEqual(target.read_bytes(), old_audio); self.assertEqual(metadata.read_bytes(), old_meta)

    async def test_publication_failure_rolls_back_old_mp3_and_never_changes_old_meta(self):
        author = importlib.import_module('curriculum_audio_authoring')
        with tempfile.TemporaryDirectory(prefix='ielts-audio-publish-') as folder:
            root = Path(folder); target, meta, candidate = root / 'old.mp3', root / 'old.json', root / 'new.mp3'
            target.write_bytes(b'old-complete-media'); meta.write_bytes(b'old-complete-metadata'); candidate.write_bytes(b'new-complete-media')
            replace = os.replace
            def fail_meta(source, destination):
                if Path(destination) == meta: raise OSError('Isolated metadata publication failure')
                return replace(source, destination)
            with mock.patch.object(author, 'WORK', root / 'work'), mock.patch.object(author.os, 'replace', side_effect=fail_meta):
                with self.assertRaises(OSError): author.publish(target, meta, candidate, {'audioHash': sha(candidate.read_bytes())})
            self.assertEqual(target.read_bytes(), b'old-complete-media'); self.assertEqual(meta.read_bytes(), b'old-complete-metadata')


if __name__ == '__main__': unittest.main()
