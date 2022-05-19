import '../App.css';
import { Component } from 'react';
import axios from 'axios';
import Auth from '@aws-amplify/auth';

let apiEndpointConfig = require('./api_endpoint.json');

class Homepage extends Component {
  state = {
    selectedFile: null,
    fileUploadedSuccessfully: false,
    bucketFiles: null
  }

  presingedEndpointURL = new URL(apiEndpointConfig.presignedResource.substring(1), apiEndpointConfig.apiEndpoint).toString();
  listDocsEndpointURL = new URL(apiEndpointConfig.listDocsResource.substring(1), apiEndpointConfig.apiEndpoint).toString();

  onFileChange = event => {
    this.setState({ selectedFile: event.target.files[0] });
  }

  onFileUpload = () => {

    const file = this.state.selectedFile;
    const fileName = this.state.selectedFile.name;
    let fileType = this.state.selectedFile.type;

    // set default MIME type if undefined
    if (!fileType) {
      fileType = "application/octet-stream";
    }

    Auth.currentAuthenticatedUser().then((user) => {
      let Token = user.signInUserSession.idToken.jwtToken;

      const config = {
        headers: { Authorization: Token }
      };

      const bodyParameters = {
        fileName: fileName,
        fileType: fileType
      };

      //call the API GW to generate the s3 presigned url to upload the file
      axios.post(this.presingedEndpointURL, bodyParameters, config).then((r) => {
        //upload the file to s3 with the returned presigned url and tag the object
        axios.put(r.data.preSignedUrl, file, { headers: { 'Content-Type': fileType, 'x-amz-tagging': `Group=${r.data.group}` } })
          .catch((err) => console.error(err));
      })
        .catch((err) => {
          console.error(err);
        })
    });

    // TODO check
    this.setState({ selectedFile: null });
    this.setState({ fileUploadedSuccessfully: true });
  }

  onFilesList = () => {

    Auth.currentAuthenticatedUser().then((user) => {
      let Token = user.signInUserSession.idToken.jwtToken;
      const config = { headers: { Authorization: Token } };

      axios.get(this.listDocsEndpointURL, config).then((r) => {
        //TODO check for empty results and do we really need to parse this as a JSON object? Pretty sure there is a better/efficient way. map?
        this.setState({ bucketFiles: JSON.parse(r.request.response).objectLists });
      })
        .catch((err) => {
          console.error(err);
        })
    });
  }

  fileData = () => {
    if (this.state.selectedFile) {
      return (
        <div>
          <h2>File Details </h2>
          <p> File Name: {this.state.selectedFile.name} </p>
          <p> File Type: {this.state.selectedFile.type} </p>
        </div>);
    }
    else if (this.state.fileUploadedSuccessfully) {
      return (
        <div>
          <br />
          <h4> file uploaded successfully </h4>
        </div>);
    }
  }

  bucketData = () => {

    if (this.state.bucketFiles) {
      return (
        <div>
          <h3>Bucket Content </h3>
          <th>File Name</th>
          <tbody>
            {this.state.bucketFiles.map(function (file, index) {
              return <tr key={index}>{file}</tr>;
            })}
          </tbody>
        </div>
      );
    }
  }

  render() {
    return (
      <div>
        <h2>Content Repository - Demo UI</h2>
        <h3>upload and list documents</h3>
        <div>
          <input type="file" onChange={this.onFileChange} />
          <button className='button' onClick={this.onFileUpload}>
            UPLOAD
          </button>
        </div>

        {this.fileData()}
        <button className='button' id='list' onClick={this.onFilesList}>
          LIST
        </button>
        {this.bucketData()}
      </div>
    );
  }
}

export default Homepage;
