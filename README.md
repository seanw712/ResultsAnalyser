## I want to build a simple webapp using React, TailwindCSS, Tesseract & PDF.js. Use Vite to install React. Keep the architecture as simple as possible to start with.

##1. Create a simple webapp interface with a file upload space (pdf/jpeg only), an interpret button and analysis output text field (editable).
##2. Create a backend that allows for: 
    #1. OCR'ing PDF's & other images 
    #2. Sending the OCR'ed text to OpenAI with a prompt to 'analyze the bloodwork' 
    #3. Returning the results in the 'analysis output text field'.



Future uses:
# 1. Find a way to exclude PII (Name, Address, Dates) before sending it to OpenAI
# 2. Return the analysis in several output boxes with one line of text for each result that is out-of-range.
# 3. Have an extra button & field that turns the separated analysis results into a patient letter.
# 4. Add a 'rules & constraints' file that specifies extra things to look out for.
