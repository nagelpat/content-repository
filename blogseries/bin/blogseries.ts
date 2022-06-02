#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { BlogseriesStack } from '../lib/blogseries-stack';
import {DemoDataStack} from '../lib/demodata-stack';

const app = new cdk.App();

new BlogseriesStack(app, 'BlogseriesStack', {
  stackName: 'repo-stack',
  description: 'creates all resources needed for the content repository solution',
});

new DemoDataStack(app, 'DemoDataStack', {
  stackName: 'demo-data-stack',
  description: 'creates demo data for the content repository solution',
});