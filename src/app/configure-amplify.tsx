'use client';

import { Amplify } from 'aws-amplify';

const amplifyConfig = {
  aws_project_region: 'ap-northeast-1',
  aws_appsync_graphqlEndpoint: process.env.NEXT_PUBLIC_AWS_APPSYNC_GRAPHQLENDPOINT,
  aws_appsync_region: 'ap-northeast-1',
  aws_appsync_authenticationType: 'API_KEY' as const,
  aws_appsync_apiKey: process.env.NEXT_PUBLIC_AWS_APPSYNC_APIKEY,
};

Amplify.configure(amplifyConfig, { ssr: true });

export default function ConfigureAmplifyClient() {
  return null;
}