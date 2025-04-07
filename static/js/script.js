document.addEventListener('DOMContentLoaded', function() {
    let allQuestions = []; // full set from server
    let filteredQuestions = []; // questions to be shown (will be modified after question 3)
    let currentQuestionIndex = 0;
    let responses = [];
    
    const questionNumber = document.getElementById('questionNumber');
    const questionText = document.getElementById('questionText');
    const answerContainer = document.getElementById('answerContainer');
    const prevButton = document.getElementById('prevButton');
    const nextButton = document.getElementById('nextButton');
    const progressBar = document.getElementById('progressBar');
    
    // Fetch questions from server
    fetch('/questions')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to fetch questions');
            }
            return response.json();
        })
        .then(data => {
            allQuestions = data;
            // Initialize responses array with empty answers for all questions
            responses = allQuestions.map(q => ({
                question: q.text,
                answer: ''
            }));
            // Set filteredQuestions to just the common questions initially (category "common")
            filteredQuestions = allQuestions.filter(q => q.category === 'common');
            displayQuestion(0);
        })
        .catch(error => {
            console.error('Error fetching questions:', error);
            questionText.textContent = 'Error loading questions. Please refresh the page.';
        });
    
    // Function to display a question from filteredQuestions
    function displayQuestion(index) {
        if (index < 0 || index >= filteredQuestions.length) return;
        
        currentQuestionIndex = index;
        const question = filteredQuestions[index];
        
        // Update the question number and text
        questionNumber.textContent = `Question ${index + 1} of ${filteredQuestions.length}`;
        
        // If this is a heading type, display it differently and no input
        if (question.type === 'heading') {
            questionText.innerHTML = `<h2>${question.text}</h2>`;
            answerContainer.innerHTML = '';
        } else {
            questionText.textContent = question.text;
            // Create input based on question type
            let inputHtml = '';
            
            switch(question.type) {
                case 'text':
                    inputHtml = `<input type="text" id="answer" value="${responses[currentQuestionIndex].answer || ''}">`;
                    break;
                case 'email':
                    inputHtml = `<input type="email" id="answer" value="${responses[currentQuestionIndex].answer || ''}">`;
                    break;
                case 'textarea':
                    inputHtml = `<textarea id="answer">${responses[currentQuestionIndex].answer || ''}</textarea>`;
                    break;
                case 'radio':
                    if (question.options) {
                        question.options.forEach((option) => {
                            const isChecked = responses[currentQuestionIndex].answer === option ? 'checked' : '';
                            inputHtml += `
                                <label class="radio-option">
                                    ${option}
                                    <input type="radio" name="answer" value="${option}" ${isChecked}>
                                    <span class="checkmark"></span>
                                </label>
                            `;
                        });
                    }
                    break;
                case 'checkbox':
                    if (question.options) {
                        const selectedOptions = responses[currentQuestionIndex].answer ? 
                            responses[currentQuestionIndex].answer.split(',') : [];
                        
                        question.options.forEach((option) => {
                            const isChecked = selectedOptions.includes(option) ? 'checked' : '';
                            inputHtml += `
                                <label class="checkbox-option">
                                    ${option}
                                    <input type="checkbox" name="answer" value="${option}" ${isChecked}>
                                    <span class="checkmark"></span>
                                </label>
                            `;
                        });
                    }
                    break;
            }
            answerContainer.innerHTML = inputHtml;
        }
        
        prevButton.disabled = index === 0;
        updateNextButtonText();
        updateProgress();
    }
    
    function updateNextButtonText() {
        nextButton.textContent = currentQuestionIndex === filteredQuestions.length - 1 ? 'Submit' : 'Next';
    }
    
    function updateProgress() {
        const progressPercentage = ((currentQuestionIndex + 1) / filteredQuestions.length) * 100;
        progressBar.style.width = `${progressPercentage}%`;
    }
    
    function collectAnswer() {
        const question = filteredQuestions[currentQuestionIndex];
        if (question.type === 'heading') return;
        
        let answer = '';
        switch(question.type) {
            case 'text':
            case 'email':
            case 'textarea':
                const textInput = document.getElementById('answer');
                if (textInput) {
                    answer = textInput.value.trim();
                }
                break;
            case 'radio':
                const selectedRadio = document.querySelector('input[name="answer"]:checked');
                if (selectedRadio) {
                    answer = selectedRadio.value;
                }
                break;
            case 'checkbox':
                const selectedCheckboxes = document.querySelectorAll('input[name="answer"]:checked');
                if (selectedCheckboxes.length > 0) {
                    answer = Array.from(selectedCheckboxes).map(cb => cb.value).join(',');
                }
                break;
        }
        responses[currentQuestionIndex].answer = answer;
    }
    
    function validateAnswer() {
        const question = filteredQuestions[currentQuestionIndex];
        if (question.type === 'heading') return true;
        const answerValue = responses[currentQuestionIndex].answer;
        
        if (answerValue === '') {
            if (question.type === 'text' || question.type === 'email' || question.type === 'radio') {
                return false;
            }
        }
        
        if (question.type === 'email' && answerValue) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(answerValue)) {
                return false;
            }
        }
        
        return true;
    }
    
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            collectAnswer();
            if (!validateAnswer()) {
                alert("Please provide a valid answer before proceeding.");
                return;
            }
            goToNextQuestion();
        }
    });
    
    nextButton.addEventListener('click', () => {
        collectAnswer();
        if (!validateAnswer()) {
            alert("Please provide a valid answer before proceeding.");
            return;
        }
        goToNextQuestion();
    });
    
    prevButton.addEventListener('click', () => {
        collectAnswer();
        if (currentQuestionIndex > 0) {
            displayQuestion(currentQuestionIndex - 1);
        }
    });
    
    function goToNextQuestion() {
        // At question 3 (index 2), handle compliance selection
        if (currentQuestionIndex === 2 && filteredQuestions[currentQuestionIndex].category === 'common') {
            const complianceAnswer = responses[currentQuestionIndex].answer;
            const selectedCompliance = complianceAnswer ? complianceAnswer.split(',').map(s => s.trim()) : [];
            
            const complianceQuestion = allQuestions.find(q => q.text === "Which compliance test do you want to take?");
            const order = (complianceQuestion && complianceQuestion.options) ? complianceQuestion.options : [];
            
            let complianceQuestions = allQuestions.filter(q => q.category !== 'common' && selectedCompliance.includes(q.category));
            
            complianceQuestions.sort((a, b) => {
                return order.indexOf(a.category) - order.indexOf(b.category);
            });
            
            let complianceWithHeadings = [];
            let lastCategory = "";
            complianceQuestions.forEach(q => {
                if (q.category !== lastCategory) {
                    complianceWithHeadings.push({
                        text: q.category,
                        type: "heading",
                        options: [],
                        category: q.category
                    });
                    lastCategory = q.category;
                }
                complianceWithHeadings.push(q);
            });
            
            const commonQuestions = allQuestions.filter(q => q.category === 'common');
            filteredQuestions = [...commonQuestions, ...complianceWithHeadings];
            
            const newResponses = [];
            filteredQuestions.forEach(q => {
                newResponses.push({ question: q.text, answer: "" });
            });
            for (let i = 0; i < commonQuestions.length; i++) {
                newResponses[i].answer = responses[i].answer;
            }
            responses = newResponses;
            
            displayQuestion(currentQuestionIndex + 1);
        } else {
            if (currentQuestionIndex === filteredQuestions.length - 1) {
                submitResponses();
            } else {
                displayQuestion(currentQuestionIndex + 1);
            }
        }
    }
    
    function submitResponses() {
        const submitUrl = window.location.origin + '/submit';
        document.querySelector('.content').innerHTML = `
            <div class="thank-you-container fade-in">
                <h2>Submitting your responses...</h2>
                <p>Please wait while we process your assessment.</p>
            </div>
        `;
        
        fetch(submitUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ responses })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok: ' + response.statusText);
            }
            return response.json();
        })
        .then(data => {
            document.querySelector('.content').innerHTML = `
                <div class="thank-you-container fade-in">
                    <h2>Thank You for Completing the Assessment!</h2>
                    <p>Your cybersecurity profile is being analyzed. Our team will generate a comprehensive report based on your responses.</p>
                    <div class="report-link">
                        <a href="/get-report" id="reportLink">Get Your Report</a>
                    </div>
                </div>
            `;
            progressBar.style.width = '100%';
        })
        .catch(error => {
            console.error('Error submitting responses:', error);
            document.querySelector('.content').innerHTML = `
                <div class="thank-you-container fade-in">
                    <h2>Submission Error</h2>
                    <p>We encountered a problem while submitting your responses. Please try again later or contact our support team.</p>
                    <div class="report-link">
                        <a href="/" id="retryLink">Try Again</a>
                    </div>
                </div>
            `;
        });
    }
});
