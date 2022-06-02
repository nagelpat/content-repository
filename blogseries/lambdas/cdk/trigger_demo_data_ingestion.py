import json
import boto3
import os
from botocore.exceptions import ClientError
import logging
import json

idp_client = boto3.client('cognito-idp')
user_pool_id = os.environ['userPoolId']
user_data = json.loads(os.environ['userData'])

def lambda_handler(event, context):

    for user in user_data:
        # create Cognito User Pool (CUP) user
        try:
            response = idp_client.admin_create_user(
                UserPoolId=user_pool_id,
                Username=user['name'],
                UserAttributes=[
                    {
                        'Name': 'email',
                        'Value': 'patrik.nagel@gmail.com'
                    },
                ],
                TemporaryPassword=user['password'],
                MessageAction='SUPPRESS',
                DesiredDeliveryMediums=[
                    'EMAIL',
                ],
            )
            logging.info(response)
        except ClientError as e:
            logging.error(e)
            return False
        
        # add user to a group
        try:
            response = idp_client.admin_add_user_to_group(
                UserPoolId=user_pool_id,
                Username=user['name'],
                GroupName=user['group']
            )
            logging.info(response)
        except ClientError as e:
            logging.error(e)
            return False
        
    return True
