from flask import Flask, request, jsonify, render_template, url_for, send_file
from flask_cors import CORS
import csv
import os
import json
from datetime import datetime
from io import BytesIO
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4

app = Flask(__name__)
CORS(app)

# Create responses.csv if it doesn't exist
def initialize_responses_file():
    if not os.path.exists('responses.csv'):
        with open('responses.csv', 'w', newline='') as file:
            writer = csv.writer(file)
            writer.writerow(['timestamp', 'company', 'email', 'response_data'])

# Route for the home page
@app.route('/')
def home():
    return render_template('index.html')

# Route for the quiz page
@app.route('/quiz')
def quiz():
    return render_template('quiz.html')

# Route to serve questions data from the JSON file,
# flattened into an array so that the front-end code can use it directly.
@app.route('/questions')
def get_questions():
    try:
        with open('questions.json', 'r', encoding='utf-8') as file:
            data = json.load(file)

        unified_questions = []

        # Process common questions
        for q in data.get("common", []):
            unified_questions.append({
                "text": q.get("text", ""),
                "type": q.get("type", ""),
                "options": q.get("options", []),
                "category": "common"
            })

        # Process compliance category questions
        for category in data.get("compliance_categories", []):
            category_name = category.get("name", "Unknown")
            for q in category.get("questions", []):
                # For compliance questions, rename "question" to "text" and extract the "option" texts
                options_list = [ro.get("option", "") for ro in q.get("response_options", [])]
                unified_questions.append({
                    "text": q.get("question", ""),
                    "type": "radio",
                    "options": options_list,
                    "category": category_name
                })

        return jsonify(unified_questions)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Endpoint to receive form responses
@app.route('/submit', methods=['POST'])
def submit():
    try:
        data = request.json
        responses = data.get('responses', [])
        if not responses:
            return jsonify({"error": "No responses received"}), 400

        # Initialize the responses file if it doesn't exist
        initialize_responses_file()

        # Extract company name and email from responses
        company = next((r['answer'] for r in responses if r['question'] == "What is your company's name?"), "Unknown")
        email = next((r['answer'] for r in responses if r['question'] == "What is your email address?"), "Unknown")

        # Write responses to CSV
        with open('responses.csv', 'a', newline='') as file:
            writer = csv.writer(file)
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            writer.writerow([timestamp, company, email, json.dumps(responses)])

        return jsonify({"message": "Responses submitted successfully!", "data": responses}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def build_recommendation_map():
    """
    Build a dictionary to map each compliance question text -> { answerOption: recommendation }.
    This allows us to look up the correct recommendation for a user's chosen answer.
    """
    recommendation_map = {}
    if not os.path.exists('questions.json'):
        return recommendation_map

    with open('questions.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Go through each compliance category
    for category in data.get("compliance_categories", []):
        for q in category.get("questions", []):
            question_text = q.get("question", "")
            recommendation_map[question_text] = {}
            for ro in q.get("response_options", []):
                # ro has keys "option", "recommendation", "acknowledgment"
                answer_option = ro.get("option", "")
                rec_text = ro.get("recommendation", "")
                recommendation_map[question_text][answer_option] = rec_text

    return recommendation_map

# Route to generate and download a PDF report based on the latest responses
@app.route('/get-report', methods=['GET'])
def get_report():
    try:
        # Read the latest response from responses.csv
        if not os.path.exists('responses.csv'):
            return jsonify({"error": "No responses found"}), 404

        with open('responses.csv', 'r', newline='', encoding='utf-8') as file:
            csv_reader = list(csv.reader(file))
            if len(csv_reader) <= 1:  # Only header row
                return jsonify({"error": "No responses found"}), 404
            latest_response = csv_reader[-1]

        timestamp, company, email, response_data = latest_response
        responses = json.loads(response_data)

        # Build a map for recommendations
        recommendation_map = build_recommendation_map()

        # Create a PDF in memory
        buffer = BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=A4)

        # Set the PDF tab title
        pdf.setTitle("Cybersecurity Report")

        # Function to add header (logo) and footer (page number)
        def add_page_elements(pdf_canvas, page_number):
            logo_path = "static/img/logo.png"
            if os.path.exists(logo_path):
                pdf_canvas.drawImage(logo_path, 450, 770, width=100, height=50)
            pdf_canvas.setFont("Helvetica", 10)
            pdf_canvas.drawCentredString(297.5, 30, f"Page {page_number}")

        # Start first page
        page_number = 1
        add_page_elements(pdf, page_number)

        # Report title
        pdf.setFont("Helvetica-Bold", 20)
        pdf.drawCentredString(297.5, 780, "Cybersecurity Report")

        # Company details
        pdf.setFont("Helvetica", 12)
        pdf.drawString(50, 750, f"Timestamp: {timestamp}")
        pdf.drawString(50, 730, f"Company: {company}")
        pdf.drawString(50, 710, f"Email: {email}")

        # A thin line below the metadata
        pdf.setLineWidth(1)
        pdf.line(50, 700, 545, 700)

        # Start printing the questions & answers
        pdf.setFont("Helvetica-Bold", 14)
        pdf.drawString(50, 680, "Responses:")
        y_position = 660
        pdf.setFont("Helvetica", 11)

        question_counter = 1

        # Skip these questions from the loop
        skip_questions = [
            "What is your company's name?",
            "What is your email address?"
        ]

        for response in responses:
            question_text = response.get("question", "")
            answer_text = response.get("answer", "")

            # If it's the compliance selection question, we can keep it or skip it
            # up to you. Let's keep it by default:
            # if question_text == "Which compliance test do you want to take?":
            #     continue

            # Skip repeated company name & email
            if question_text in skip_questions:
                continue

            # Numbered question
            pdf.setFont("Helvetica-Bold", 11)
            pdf.drawString(50, y_position, f"({question_counter}) {question_text}")
            y_position -= 16

            # Print the answer on next line
            pdf.setFont("Helvetica", 11)
            pdf.drawString(65, y_position, f"Answer: {answer_text}")
            y_position -= 16

            # Lookup recommendation if any
            recommendation = "N/A"
            # If this question is in the recommendation map and the user’s answer is in the map
            if question_text in recommendation_map:
                # For multi-select answers (checkbox), the user might have chosen multiple options
                # separated by commas. We'll look up each option's recommendation and join them.
                user_options = [opt.strip() for opt in answer_text.split(',') if opt.strip()]
                recs = []
                for opt in user_options:
                    rec_text = recommendation_map[question_text].get(opt, "")
                    if rec_text:
                        recs.append(rec_text)
                if recs:
                    recommendation = " | ".join(recs)

            # Print recommendation
            pdf.setFont("Helvetica-Oblique", 10)
            pdf.drawString(65, y_position, f"Recommendation: {recommendation}")
            y_position -= 24

            question_counter += 1

            # If we're near bottom, start a new page
            if y_position < 60:
                pdf.showPage()
                page_number += 1
                add_page_elements(pdf, page_number)
                y_position = 780

        pdf.save()
        buffer.seek(0)
        return send_file(
            buffer,
            as_attachment=True,
            download_name="cybersecurity_report.pdf",
            mimetype='application/pdf'
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True)
