import json
import boto3
import os
from botocore.config import Config
from botocore.exceptions import ClientError
import logging

cors_rule = os.environ['corsRule']
region_name = os.environ['regionName']
bucket_name = os.environ['bucketName']

def lambda_handler(event, context):

    try:
        s3_client = boto3.client('s3', region_name=region_name, config=Config(signature_version='s3v4'))
        s3_client.put_bucket_cors(Bucket=bucket_name,CORSConfiguration=cors_rule)
    except ClientError as e:
        logging.error(e)
        return False
        
    return True