'use client';

import { Amplify } from 'aws-amplify';
import awsExports from '../aws-exports';

// Amplifyをモジュールレベルで初期化（SSRセーフ）
console.log('🔧 configure-amplify.tsx: Amplify.configure()実行中...');
console.log('📋 awsExports:', {
  region: awsExports.aws_project_region,
  endpoint: awsExports.aws_appsync_graphqlEndpoint,
  hasApiKey: !!awsExports.aws_appsync_apiKey,
  apiKey: awsExports.aws_appsync_apiKey?.substring(0, 10) + '...'
});

Amplify.configure(awsExports, { ssr: true });
console.log('✅ Amplify.configure()完了');

export default function ConfigureAmplifyClient() {
  return null;
}