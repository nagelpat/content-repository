import boto3
import os
import json
from botocore.exceptions import ClientError
from botocore.config import Config
from claims_utils import claims_evaluator

sts_client = boto3.client('sts')
client = boto3.client('cognito-idp')
bucket_name = os.environ['uploadBucketName']
allow_origins = os.environ['allowOrigins']
region = os.environ['region']

def lambda_handler(event, context):
    
    body = json.loads(event['body'])
    fileName = body['fileName']
    fileType = body['fileType']
    
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
    assumed_role_object = sts_client.assume_role(
        RoleArn=preferred_role_arn,
        RoleSessionName='S3Role'
    )
    credentials=assumed_role_object['Credentials']

    # create the s3 client
    s3_client = boto3.client(
        's3',
        aws_access_key_id=credentials['AccessKeyId'],
        aws_secret_access_key=credentials['SecretAccessKey'],
        aws_session_token=credentials['SessionToken'],
        region_name=region,
        config=Config(signature_version='s3v4'))
    
    # create presigned s3 url to upload the object
    try:
        params = {'Bucket': bucket_name, 'Key': preferred_group_name+'/'+fileName, 'ContentType': fileType, 'Tagging': 'Group={0}'.format(preferred_group_name)}
        presignedurl = s3_client.generate_presigned_url(
            'put_object',
            params
        )
    except ClientError as error:
        print(error)
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': allow_origins,
                'Access-Control-Allow-Credentials': True
            }
            };
    
    # return the presigned url and the preferred group name for tagging the object
    return {
        'statusCode': 200,
        'headers': {
            'Access-Control-Allow-Origin': allow_origins,
            'Access-Control-Allow-Credentials': True
            },
            'body': json.dumps({'preSignedUrl': presignedurl, 'group': preferred_group_name})
            };
    