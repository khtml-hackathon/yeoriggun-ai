import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../services/api_client.dart';
import '../state/session_state.dart';
import 'record_audio_screen.dart';

class UploadPhotoScreen extends StatefulWidget {
  const UploadPhotoScreen({super.key, required this.apiBase});

  final String apiBase;

  @override
  State<UploadPhotoScreen> createState() => _UploadPhotoScreenState();
}

class _UploadPhotoScreenState extends State<UploadPhotoScreen> {
  final ImagePicker _picker = ImagePicker();
  bool _loading = false;
  String? _error;

  Future<void> _pickAndAnalyze() async {
    setState(() { _error = null; });
    final XFile? picked = await _picker.pickImage(source: ImageSource.gallery, imageQuality: 95);
    if (picked == null) return;

    final file = File(picked.path);
    final state = context.read<SessionState>();
    state.setImage(file);

    setState(() { _loading = true; });
    try {
      final api = ApiClient(widget.apiBase);
      final result = await api.analyzeImage(file);
      state.setAnalyzeResult(result);
      if (!mounted) return;
      Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => RecordAudioScreen(apiBase: widget.apiBase)),
      );
    } catch (e) {
      setState(() { _error = e.toString(); });
    } finally {
      if (mounted) setState(() { _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final img = context.watch<SessionState>().selectedImage;
    return Scaffold(
      appBar: AppBar(title: const Text('1) 사진 업로드')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (img != null)
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.file(img, height: 220, fit: BoxFit.cover),
              )
            else
              Container(
                height: 220,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: Colors.grey.shade200,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Text('이미지를 선택하세요'),
              ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: _loading ? null : _pickAndAnalyze,
              icon: const Icon(Icons.photo),
              label: Text(_loading ? '분석 중...' : '이미지 선택 및 분석'),
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


