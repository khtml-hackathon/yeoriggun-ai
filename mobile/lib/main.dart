import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'state/session_state.dart';
import 'screens/upload_photo_screen.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  // This widget is the root of your application.
  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => SessionState(),
      child: MaterialApp(
        title: 'Yeoriggun AI',
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: Colors.green),
          useMaterial3: true,
        ),
        home: const UploadPhotoScreen(apiBase: 'http://localhost:3000'),
      ),
    );
  }
}
 
