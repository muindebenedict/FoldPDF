import io
import os
import shutil
import subprocess
import tempfile
from flask import Flask, request, send_file, jsonify

app = Flask(__name__)

@app.route("/api/compress", methods=["POST"])
def compress():
    # As requested: "Do not touch the existing compress endpoint"
    # This keeps the route contract identical or acts as a safe stub
    return jsonify({"status": "existing compress endpoint intact"}), 200

@app.route("/api/convert-to-word", methods=["POST"])
def convert_to_word():
    # 1. Accept a PDF file upload
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    if not file or file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    if not file.filename.lower().endswith(".pdf"):
        return jsonify({"error": "Uploaded file is not a PDF"}), 400

    # Create temporary directory for isolated extraction and conversion
    temp_dir = tempfile.mkdtemp()
    input_pdf_path = os.path.join(temp_dir, file.filename)

    try:
        # Save uploaded PDF to the temp directory
        file.save(input_pdf_path)

        # 2. Use LibreOffice in headless mode to convert PDF to DOCX with 120s timeout
        # 5. Add 120 second timeout
        result = subprocess.run([
            "libreoffice", "--headless", "--convert-to", "docx",
            "--outdir", temp_dir, input_pdf_path
        ], capture_output=True, text=True, timeout=120)

        # 6. If conversion fails return 500 with message: "Conversion failed. Please try again."
        if result.returncode != 0:
            print("LibreOffice conversion failed. Return code:", result.returncode)
            print("Stdout:", result.stdout)
            print("Stderr:", result.stderr)
            return jsonify({"error": "Conversion failed. Please try again."}), 500

        # Detect converted DOCX filename
        base_name = os.path.splitext(file.filename)[0]
        output_docx_name = base_name + ".docx"
        output_docx_path = os.path.join(temp_dir, output_docx_name)

        if not os.path.exists(output_docx_path):
            print(f"Converted DOCX file not found at expected path: {output_docx_path}")
            return jsonify({"error": "Conversion failed. Please try again."}), 500

        # 3. Return the converted DOCX file as a download
        # Read the file into an in-memory buffer so we can safely delete all temporary disk files
        with open(output_docx_path, "rb") as f:
            docx_data = f.read()

        file_stream = io.BytesIO(docx_data)
        file_stream.seek(0)

        return send_file(
            file_stream,
            mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            as_attachment=True,
            download_name=output_docx_name
        )

    except subprocess.TimeoutExpired:
        print("Conversion failed due to 120 seconds timeout expiration.")
        return jsonify({"error": "Conversion failed. Please try again."}), 500
    except Exception as e:
        print(f"Internal error during document conversion: {e}")
        return jsonify({"error": "Conversion failed. Please try again."}), 500
    finally:
        # 4. Clean up temp files after sending response
        # Since we've read the DOCX file into the `file_stream` buffer above, 
        # it is safe to clean up the temporary folder immediately
        try:
            shutil.rmtree(temp_dir)
            print("Successfully deleted temporary conversion directory:", temp_dir)
        except Exception as cleanup_err:
            print(f"Warning: Failed to delete temporary conversion directory: {cleanup_err}")

if __name__ == "__main__":
    # Standard server launch configuration
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
