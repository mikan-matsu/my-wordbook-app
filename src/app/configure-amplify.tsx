'use client';

import { Amplify } from 'aws-amplify';
import awsExports from '../aws-exports';

// Amplifyをモジュールレベルで初期化（SSRセーフ）
// useEffectを使うと初期化のタイミングが遅れ、generateClient()が失敗する可能性がある
Amplify.configure(awsExports, { ssr: true });

export default function ConfigureAmplifyClient() {
  return null;
}