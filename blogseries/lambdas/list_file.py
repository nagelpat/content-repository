import boto3
import json
import os
from botocore.config import Config
from claims_utils import claims_evaluator

sts_client = boto3.client('sts')
bucket_name = os.environ['uploadBucketName']
allow_origins = os.environ['allowOrigins']
region = os.environ['region']

def lambda_handler(event, context):
    
    #  get the preferred cognito group of the user and the related group name
    response_error, preferred_role_arn, preferred_group_name = claims_evaluator(event['requestContext']['authorizer']['claims'])
    
    if(response_error):
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': allow_origins,
                'Access-Control-Allow-Credentials': True
            }
        }
    
    # assume execution role based on preferred cognito user pool group
    response = sts_client.assume_role(
        RoleArn=preferred_role_arn,
        RoleSessionName='ListAPIrole',
        # adding preferred group name to the session to use it as attribute based access control policy  
        Tags=[
        {
            'Key': 'groupname',
            'Value': f"{preferred_group_name}"
        },
    ]
    )
    credentials=response['Credentials']
    
    # create the s3 client
    s3_client = boto3.client(
        's3',
        aws_access_key_id=credentials['AccessKeyId'],
        aws_secret_access_key=credentials['SecretAccessKey'],
        aws_session_token=credentials['SessionToken'],
        region_name=region,
        config=Config(signature_version='s3v4'))
    
    # return the list of keys in the S3 bucket that matches the preferred group name prefix
    keys = []
    for key in s3_client.list_objects(Bucket=bucket_name,Prefix=preferred_group_name)['Contents']:
        keys.append(key['Key']) 
    
    response2api = {"statusCode": 200,"headers": { 'Access-Control-Allow-Origin': allow_origins,
                'Access-Control-Allow-Credentials': 'true',
                },"body": json.dumps({"objectLists": keys})}

    return response2api
    