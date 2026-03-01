'use client';

import { useEffect } from 'react';
import { Amplify } from 'aws-amplify';
import awsExports from '../aws-exports';

export default function ConfigureAmplifyClient() {
  useEffect(() => {
    Amplify.configure(awsExports, { ssr: true });
  }, []);

  return null;
}