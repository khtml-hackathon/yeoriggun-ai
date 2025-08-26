import 'dart:io';

import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

class AudioRecorderService {
  final AudioRecorder _recorder = AudioRecorder();
  String? _path;

  Future<File> startRecording() async {
    final hasPerm = await _recorder.hasPermission();
    if (hasPerm != true) {
      throw Exception('Microphone permission denied');
    }

    final dir = await getTemporaryDirectory();
    final path = '${dir.path}/rec_${DateTime.now().millisecondsSinceEpoch}.wav';
    _path = path;
    await _recorder.start(
      const RecordConfig(
        encoder: AudioEncoder.wav,
        sampleRate: 16000,
        numChannels: 1,
      ),
      path: path,
    );
    return File(path);
  }

  Future<File?> stopRecording() async {
    final p = await _recorder.stop();
    if (p == null) return null;
    return File(p);
  }
}


