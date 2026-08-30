'use client';

import { Amplify } from 'aws-amplify';
import outputs from '../../amplify_outputs.json';

// Amplifyをモジュールレベルで初期化（SSRセーフ）
Amplify.configure(outputs, { ssr: true });

export default function ConfigureAmplifyClient() {
  return null;
}