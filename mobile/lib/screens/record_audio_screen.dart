import 'dart:io';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/audio_recorder.dart';
import '../services/api_client.dart';
import '../state/session_state.dart';
import 'result_screen.dart';

class RecordAudioScreen extends StatefulWidget {
  const RecordAudioScreen({super.key, required this.apiBase});

  final String apiBase;

  @override
  State<RecordAudioScreen> createState() => _RecordAudioScreenState();
}

class _RecordAudioScreenState extends State<RecordAudioScreen> {
  final AudioRecorderService _rec = AudioRecorderService();
  bool _recording = false;
  bool _loading = false;
  String? _error;
  File? _audioFile;

  Future<void> _toggleRecord() async {
    setState(() { _error = null; });
    try {
      if (!_recording) {
        await _rec.startRecording();
        setState(() { _recording = true; });
      } else {
        final f = await _rec.stopRecording();
        if (f != null) {
          setState(() { _audioFile = f; });
          context.read<SessionState>().setAudio(f);
        }
        setState(() { _recording = false; });
      }
    } catch (e) {
      setState(() { _error = e.toString(); });
    }
  }

  Future<void> _callStt() async {
    final audio = _audioFile ?? context.read<SessionState>().recordedAudio;
    if (audio == null) { setState(() { _error = '오디오가 없습니다.'; }); return; }
    setState(() { _loading = true; _error = null; });
    try {
      final api = ApiClient(widget.apiBase);
      final res = await api.sttSummarize(audio);
      context.read<SessionState>().setSttResult(res);
      if (!mounted) return;
      Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => ResultScreen()),
      );
    } catch (e) {
      setState(() { _error = e.toString(); });
    } finally {
      if (mounted) setState(() { _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('2) 음성 녹음')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ElevatedButton.icon(
              onPressed: _toggleRecord,
              icon: Icon(_recording ? Icons.stop : Icons.mic),
              label: Text(_recording ? '녹음 종료' : '녹음 시작'),
            ),
            const SizedBox(height: 12),
            ElevatedButton.icon(
              onPressed: (_audioFile != null && !_loading) ? _callStt : null,
              icon: const Icon(Icons.send),
              label: Text(_loading ? '전송 중...' : '인식 및 요약'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(color: Colors.red)),
            ],
          ],
        ),
      ),
    );
  }
}


