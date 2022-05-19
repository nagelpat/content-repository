import json
import boto3
import os
from botocore.exceptions import ClientError
import logging

amplify_client = boto3.client('amplify')
amplify_app_id = os.environ['amplifyAppId']
branch_name = os.environ['branchName']

def lambda_handler(event, context):

    try:
        response = amplify_client.start_job(
            appId=amplify_app_id,
            branchName=branch_name,
            jobType='RELEASE',
            jobReason='deployment triggered by CDK'
        )
        logging.info(response)
    except ClientError as e:
        logging.error(e)
        return False
        
    return True