import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './FileUpload.css';
import { RiErrorWarningFill } from "react-icons/ri";
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const FileUpload = React.memo(() => {
    const [file, setFile] = useState(null);
    const [title, setTitle] = useState('');
    const [downloadUrl, setDownloadUrl] = useState('');
    const [pdfFileUrl, setPdfFileUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth <= 500);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const handleFileChange = (event) => {
        const selectedFile = event.target.files[0];
        console.log('Selected file:', selectedFile);
        setFile(selectedFile);
        event.target.value = null;
    };

    const handleTitleChange = (event) => {
        setTitle(event.target.value);
    };

    const handleDragOver = (event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragActive(true);
    };

    const handleDragLeave = (event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragActive(false);
    };

    const handleDrop = (event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragActive(false);

        const droppedFiles = event.dataTransfer.files;
        if (droppedFiles && droppedFiles[0]) {
            console.log('Dropped file:', droppedFiles[0]);
            setFile(droppedFiles[0]);
        }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (!file) {
            toast.error('Please select or drop a file to upload.', {
                position: "top-right",
                autoClose: 5000,
                hideProgressBar: false,
                closeOnClick: true,
                pauseOnHover: true,
                draggable: true,
                progress: undefined,
            });
            return;
        }

        setIsLoading(true);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', title);

        try {
            const response = await axios.post('http://localhost:5000/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

if (response.data && response.data.excelFileUrl && response.data.pdfFileUrl) {
    setDownloadUrl(response.data.excelFileUrl.replace('/public', ''));
    setPdfFileUrl(response.data.pdfFileUrl.replace('/public', ''));
} else {
    throw new Error('Invalid response from the server');
}
        } catch (error) {
    console.error('Error uploading file:', error);
    toast.error('Error uploading file. Please refresh and try again.', {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
    });
} finally {
    setIsLoading(false);
}
    };

useEffect(() => {
    console.log('Updated download URL:', downloadUrl);
    console.log('Updated PDF URL:', pdfFileUrl);
}, [downloadUrl, pdfFileUrl]);

return (
    <div>
        <ToastContainer />
        <h1>Convert Handwritten Tables into Excel or PDF</h1>
        <div className={`container ${isMobile ? 'mobile-layout' : ''}`}>
            <form onSubmit={handleSubmit}>
                <div
                    className={`drag-drop-zone ${dragActive ? 'active' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    {!file ? (
                        <>
                            <h2>Drag & Drop a file here or click to select</h2>
                            <p style={{ color: '#878787', fontFamily: 'monospace', marginBottom: '0', fontSize: '1em' }}>(PDF, JPG, JPEG, PNG)</p>
                            <input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png"
                                onChange={handleFileChange}
                                style={{ display: 'none' }}
                                id="fileInput"
                            />
                            <label htmlFor="fileInput" className="file-input-label">
                                Select File
                            </label>
                            {isMobile && (
                                <div style={{ marginTop: '10px' }}>
                                    <label htmlFor="cameraInput" className="file-input-label">
                                        Take Photo
                                    </label>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        onChange={handleFileChange}
                                        style={{ display: 'none' }}
                                        id="cameraInput"
                                    />
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <p>Selected file: {file.name}</p>
                            <button type="button" onClick={() => setFile(null)}>
                                Change File
                            </button>
                        </>
                    )}
                </div>

                <div className='text-box'>
                    <label>Enter Title:</label>
                    <input
                        type="text"
                        placeholder="Optional"
                        value={title}
                        onChange={handleTitleChange}
                    />
                </div>

                <button type="submit" disabled={isLoading}>
                    {isLoading ? 'Uploading...' : 'Upload'}
                </button>
            </form>

            {
                isMobile && downloadUrl && (
                    <div className='success'>
                        <p>File uploaded successfully!</p>
                        <a
                            href={`http://localhost:5000${downloadUrl}`}
                            download={file}
                        >
                            Download Excel
                        </a>

                        <a
                            href={`http://localhost:5000${pdfFileUrl}`}
                            download={file}
                            style={{ marginLeft: '10px' }}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Download PDF
                        </a>
                    </div>
                )
            }

            <div className="content">
                <h3>For best results:</h3>
                <ul>
                    <li>Ensure the file size does not exceed 10MB for smooth processing.</li>
                    <li>Use high-resolution images to ensure better recognition of text and table structures.</li>
                    <li>Avoid blurry images.</li>
                    <li>Use documents with well-aligned rows and columns for more accurate conversion.</li>
                    <li>After downloading the Excel or PDF, verify the data formatting and adjust as needed.</li>
                </ul>
                <div className="warning">
                    <div className="text-1"><RiErrorWarningFill className='icon' /><p>Files will be automatically deleted after 1 hour.</p></div>
                    <div className="text-2"><RiErrorWarningFill className='icon' /><p>Do not upload sensitive, confidential, or personal information.</p></div>
                </div>
            </div>
        </div >

        {!isMobile && downloadUrl && (
            <div className='success'>
                <p>File uploaded successfully!</p>
                <a
                    href={`http://localhost:5000${downloadUrl}`}
                    download={file}
                >
                    Download Excel
                </a>

                <a
                    href={`http://localhost:5000${pdfFileUrl}`}
                    download={file}
                    style={{ marginLeft: '10px' }}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Download PDF
                </a>
            </div>
        )}
    </div >
);
});

export default FileUpload;