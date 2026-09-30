from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
import math
import os
import sys
import uuid
from dotenv import load_dotenv
from typing import List, Dict, Any, Tuple, Optional
import re
import json
from rapidfuzz import fuzz, process
import nltk
from nltk.stem import WordNetLemmatizer, PorterStemmer
from nltk.corpus import wordnet
import requests
import random
from datetime import datetime
from semantic_similarity import compare_projects as compare_semantic_projects
from semantic_similarity import compare_texts as compare_semantic_texts
from project_similarity_service import compare_projects_multi_model
from model_registry import registry as research_model_registry
from research_config import DEFAULT_THRESHOLD_EXPERIMENTS
from research_metrics import classification_metrics, optimal_thresholds, processing_metrics, regression_metrics, statistical_tests, threshold_analysis
from ranking_metrics import evaluate_ranking
from batch_research_service import (
    compare_proposal_to_recorded_projects,
    run_project_pair_experiment,
    run_supervisor_matching_experiment,
)

# Download required NLTK data (only once)
try:
    nltk.data.find('corpora/wordnet')
except LookupError:
    print("Warning: NLTK wordnet data is not installed. Continuing without startup downloads.")

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)

# Configuration
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'txt', 'pdf', 'docx'}
MODEL_NAME = 'sentence-transformers/all-MiniLM-L6-v2'  # Lightweight model for semantic embeddings

# Ensure upload folder exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Initialize TF-IDF Vectorizer
tfidf_vectorizer = TfidfVectorizer(stop_words='english')

# Initialize NLP tools
lemmatizer = WordNetLemmatizer()
stemmer = PorterStemmer()

# ============================================
# ULTRA-ADVANCED CONVERSATIONAL AI ENGINE v3.0
# ============================================

# Gemini API Configuration
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent'

# AI Personality Configuration
AI_NAME = "Hormuud AI"
AI_PERSONALITY = {
    "name": AI_NAME,
    "role": "Academic Project Assistant at Hormuud University",
    "traits": ["friendly", "helpful", "encouraging", "knowledgeable"],
    "language_style": "warm, professional, and supportive"
}

# Conversation memory (in production, use Redis or database)
conversation_memory = {}

# ============================================
# ADVANCED CONVERSATIONAL PATTERNS (Semantic Understanding)
# ============================================

# Full sentence patterns for conversational understanding
CONVERSATIONAL_PATTERNS = {
    'greeting': [
        # How are you patterns
        'how are you', 'how r u', 'how ru', 'hru', 'how are u',
        'how you doing', 'how are you doing', 'how is it going',
        'how do you do', 'how have you been', 'how u doing',
        "how's it going", "how's everything", "how's life",
        'whats up', "what's up", 'wassup', 'wazzup', 'sup',
        'what is up', 'wats up', 'watsup',
        # Basic greetings  
        'hi', 'hello', 'hey', 'hii', 'hiii', 'helloo', 'helo', 'heyy', 'heyyy',
        'good morning', 'good afternoon', 'good evening', 'good day', 'good night',
        'morning', 'afternoon', 'evening',
        'greetings', 'howdy', 'yo', 'hiya', 'heya',
        'hai', 'hola', 'hy', 'hellow', 'henlo',
        # Cultural greetings
        'assalamu alaikum', 'assalamualaikum', 'salam', 'salaam',
        'as-salamu alaykum', 'assalamu', 'marhaba', 'peace',
        'iska waran', 'nabad', 'subax wanaagsan', 'galab wanaagsan',
    ],
    'wellbeing_question': [
        'are you okay', 'are you ok', 'are you alright', 'you okay',
        'you good', 'are you good', 'everything okay', 'all good',
        'how do you feel', 'are you well', 'you alright',
    ],
    'about_ai': [
        'who are you', 'what are you', 'what is your name', 'whats your name',
        "what's your name", 'tell me about yourself', 'introduce yourself',
        'who made you', 'who created you', 'what can you do',
        'are you a robot', 'are you ai', 'are you human', 'are you real',
        'what is this', 'what is this app', 'how does this work',
    ],
    'thanks': [
        'thank you', 'thanks', 'thank u', 'thx', 'thnx', 'thnks', 'ty', 'tysm',
        'thanks a lot', 'thank you so much', 'thanks so much', 'much appreciated',
        'appreciate it', 'grateful', 'thats helpful', "that's helpful",
        'you are helpful', 'youre helpful', "you're helpful",
        'awesome thanks', 'great thanks', 'perfect thanks',
        'nice one', 'cool thanks', 'amazing thank you',
        'shukran', 'mahadsanid', 'mahad', 'waad mahadsantahay',
    ],
    'goodbye': [
        'bye', 'goodbye', 'good bye', 'see you', 'see ya', 'later',
        'take care', 'have a nice day', 'have a good day',
        'gotta go', 'got to go', 'i have to go', 'im leaving', "i'm leaving",
        'talk later', 'talk to you later', 'ttyl', 'cya', 'peace out',
        'nabad gelyo', 'nabad', 'nabadeey',
    ],
    'positive_feedback': [
        'yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'alright',
        'right', 'correct', 'exactly', 'perfect', 'great', 'good',
        'nice', 'cool', 'awesome', 'amazing', 'wonderful', 'excellent',
        'love it', 'like it', 'sounds good', 'sounds great',
        'thats right', "that's right", 'thats correct', "that's correct",
        'haa', 'waa', 'hagaag',  # Somali yes/good
    ],
    'negative_feedback': [
        'no', 'nope', 'nah', 'not really', 'not interested',
        'dont want', "don't want", 'no thanks', 'no thank you',
        'nevermind', 'never mind', 'forget it', 'cancel',
        'stop', 'wrong', 'incorrect', 'thats wrong', "that's wrong",
        'maya', 'maaha',  # Somali no
    ],
    'help_request': [
        'help', 'help me', 'i need help', 'can you help', 'please help',
        'assist me', 'assistance', 'support',
        'im confused', "i'm confused", 'im lost', "i'm lost",
        'i dont understand', "i don't understand", 'dont get it', "don't get it",
        'what should i do', 'what do i do', 'guide me',
        'how does this work', 'explain', 'explain this',
    ],
    'joke_request': [
        'tell me a joke', 'make me laugh', 'say something funny',
        'tell a joke', 'joke please', 'be funny', 'entertain me',
    ],
    'compliment': [
        'you are smart', 'youre smart', "you're smart",
        'you are amazing', 'youre amazing', "you're amazing",
        'you are helpful', 'youre helpful', "you're helpful",
        'you are the best', 'youre the best', "you're the best",
        'i like you', 'love you', 'good bot', 'nice bot',
        'you are good', 'youre good', "you're good",
    ],
    'apology': [
        'sorry', 'im sorry', "i'm sorry", 'my bad', 'my mistake',
        'apologize', 'apologies', 'excuse me', 'pardon',
    ],
    'frustration': [
        'this is frustrating', 'im frustrated', "i'm frustrated",
        'not working', 'doesnt work', "doesn't work", 'broken',
        'useless', 'stupid', 'dumb', 'annoying', 'ugh', 'argh',
    ],
    'boredom': [
        'im bored', "i'm bored", 'bored', 'nothing to do',
        'entertain me', 'do something', 'say something',
    ],
}

# Conversational responses with personality
CONVERSATIONAL_RESPONSES = {
    'greeting': [
        f"👋 Hello! I'm {AI_NAME}, your Academic Project Assistant! How can I help you find the perfect graduation project today?",
        f"🌟 Hi there! Welcome! I'm {AI_NAME}, here to help you discover amazing project ideas. What field interests you?",
        f"😊 Hey! Great to meet you! I'm {AI_NAME}. Ready to explore some exciting project ideas together?",
        f"🎓 Hello and welcome to Hormuud University's Project Assistant! I'm {AI_NAME}. What would you like to work on?",
    ],
    'wellbeing_response': [
        f"😊 I'm doing great, thank you for asking! I'm here and ready to help you find an amazing project. What interests you?",
        f"🌟 I'm wonderful! Thanks for checking in. Now, let's find you the perfect graduation project! What topics excite you?",
        f"💫 I'm excellent, thank you! It's so nice of you to ask. How can I assist you with your project search today?",
        f"😄 I'm fantastic! Always happy to chat. Tell me - what kind of project are you dreaming about?",
    ],
    'about_ai': [
        f"🤖 I'm {AI_NAME}, an AI assistant designed specifically for Hormuud University students! I help you discover graduation project ideas, match you with supervisors, and guide your academic journey. I understand natural language, can handle typos, and even know some Somali! How can I help you?",
        f"👋 Great question! I'm {AI_NAME}, your smart academic companion. I can:\n• Find project ideas based on your interests\n• Understand you even with typos or informal language\n• Help match you with the right supervisor\n• Chat naturally in English or Somali\n\nWhat would you like to explore?",
    ],
    'thanks': [
        "😊 You're very welcome! I'm always happy to help. Is there anything else you'd like to explore?",
        "🌟 My pleasure! Don't hesitate to ask if you need more help with your project journey!",
        "💫 Glad I could help! Feel free to come back anytime. Good luck with your project!",
        "😄 Anytime! That's what I'm here for. Need help with anything else?",
        "🙏 Adaa mudan! (You're welcome in Somali!) Happy to assist anytime!",
    ],
    'goodbye': [
        "👋 Goodbye! Best of luck with your graduation project! Come back anytime you need help!",
        "🎓 See you later! Wishing you success in your academic journey! Nabad gelyo!",
        "✨ Take care! Remember, I'm always here when you need project guidance. Bye!",
        "👋 Bye for now! May your project be amazing! Come back anytime!",
    ],
    'positive_feedback': [
        "😊 Great! I'm glad you like it! Would you like to explore more options or is there something specific you want to know?",
        "🎉 Awesome! Let me know if you want more details about any project or need help with the next steps!",
        "✨ Perfect! Feel free to ask if you have any questions about the projects!",
    ],
    'negative_feedback': [
        "🤔 No problem! Let me know what you're looking for and I'll try to find better matches. What interests you?",
        "💭 That's okay! Tell me more about what you have in mind, and I'll search for something better suited to you.",
        "📝 Understood! What type of project would you prefer? I can search in different categories.",
    ],
    'help_request': [
        f"🆘 Of course I'll help! Here's what you can do:\n\n📝 **Find Projects:** Just type a topic like 'AI', 'web', 'healthcare'\n💬 **Chat Naturally:** Say things like 'I'm interested in mobile apps'\n🔍 **Browse Categories:** Ask about IoT, Security, Blockchain, etc.\n\nWhat interests you?",
        f"💡 I'm here to help! Just tell me:\n• What technology interests you? (AI, Web, Mobile, etc.)\n• What problem do you want to solve?\n• Or just chat - I understand natural language!\n\nWhat would you like to explore?",
    ],
    'joke_request': [
        "😄 Why do programmers prefer dark mode? Because light attracts bugs! 🐛\n\nNow, ready to find some project ideas?",
        "🤣 Why did the developer go broke? Because he used up all his cache! 💰\n\nOkay, back to projects - what interests you?",
        "😂 There are only 10 types of people: those who understand binary and those who don't!\n\nAlright, let's get serious - what project topic interests you?",
    ],
    'compliment': [
        f"😊 Aww, thank you so much! That really means a lot! I'm here to make your project journey easier. How can I help?",
        f"🥰 You're too kind! I try my best to be helpful. Now, let's find you an amazing project!",
        f"💫 Thank you! Comments like that make my circuits happy! 🤖 What can I do for you?",
    ],
    'apology': [
        "😊 No need to apologize at all! How can I help you?",
        "👍 That's completely fine! What would you like to explore?",
        "🙂 No worries! Let's move forward. What interests you?",
    ],
    'frustration': [
        "😔 I'm sorry you're feeling frustrated. Let me try to help better. Can you tell me simply what you're looking for?",
        "🤗 I understand, and I want to help! Let's start fresh - just tell me one topic that interests you.",
        "💙 I hear you. Let me try harder! Type just one word about what interests you (like 'AI' or 'web') and I'll find great matches.",
    ],
    'boredom': [
        "🎲 Let's make things interesting! Here are some cool project categories:\n• 🤖 AI & Machine Learning\n• 🌐 Web Development\n• 📱 Mobile Apps\n• 🔐 Cybersecurity\n\nWhich one sounds exciting?",
        "✨ I've got tons of interesting projects! Try asking about: IoT, Blockchain, Healthcare Tech, or Gaming. What catches your eye?",
    ],
    'unclear': [
        "🤔 I want to make sure I understand you correctly. Are you:\n• Looking for project ideas? (Just tell me a topic!)\n• Wanting to chat? (I'm happy to talk!)\n• Needing help? (Ask me anything!)\n\nWhat would you like?",
    ],
}

# Academic tech jokes for personality
TECH_JOKES = [
    "Why do Java developers wear glasses? Because they can't C#! 😄",
    "A SQL query walks into a bar, walks up to two tables and asks... 'Can I join you?' 🍺",
    "Why did the developer quit? Because he didn't get arrays! 💼",
    "What's a programmer's favorite hangout place? Foo Bar! 🍸",
    "Why do programmers always mix up Halloween and Christmas? Because Oct 31 = Dec 25! 🎃🎄",
]

# Synonym mapping for technology/topic terms
TOPIC_SYNONYMS = {
    'ai': ['artificial intelligence', 'machine learning', 'ml', 'deep learning', 'neural network', 'intelligence', 'smart', 'intelligent'],
    'web': ['website', 'webpage', 'frontend', 'backend', 'fullstack', 'full stack', 'internet', 'online', 'browser'],
    'mobile': ['app', 'android', 'ios', 'smartphone', 'phone', 'application', 'tablet'],
    'iot': ['internet of things', 'sensors', 'embedded', 'arduino', 'raspberry', 'smart home', 'smart devices', 'hardware'],
    'security': ['cybersecurity', 'cyber security', 'hacking', 'encryption', 'privacy', 'protection', 'secure', 'firewall', 'authentication'],
    'blockchain': ['crypto', 'cryptocurrency', 'bitcoin', 'ethereum', 'decentralized', 'distributed ledger', 'nft', 'web3'],
    'data': ['database', 'analytics', 'big data', 'data science', 'visualization', 'statistics', 'analysis'],
    'cloud': ['aws', 'azure', 'google cloud', 'hosting', 'server', 'serverless', 'devops', 'deployment'],
    'game': ['gaming', 'video game', 'unity', 'unreal', 'game development', 'gamedev'],
    'health': ['healthcare', 'medical', 'hospital', 'patient', 'doctor', 'telemedicine', 'health care'],
    'education': ['learning', 'elearning', 'e-learning', 'school', 'university', 'student', 'teaching', 'academic'],
    'finance': ['banking', 'fintech', 'payment', 'money', 'transaction', 'financial'],
    'ecommerce': ['e-commerce', 'shopping', 'store', 'retail', 'marketplace', 'online store', 'cart'],
    'social': ['social media', 'networking', 'community', 'chat', 'messaging', 'communication'],
    'automation': ['automate', 'automatic', 'robot', 'robotics', 'rpa', 'workflow'],
    'nlp': ['natural language', 'text processing', 'language processing', 'chatbot', 'text analysis', 'sentiment']
}

# Somali to English mappings for common phrases
SOMALI_MAPPINGS = {
    'mashruuc': 'project',
    'fikrad': 'idea',
    'barnaamij': 'program',
    'technologyada': 'technology',
    'caafimaad': 'health',
    'waxbarasho': 'education',
    'lacag': 'finance',
    'amni': 'security',
    'internet': 'web',
    'kombuyuutar': 'computer',
    'telefoon': 'mobile',
    'ciyaar': 'game',
    'suuq': 'ecommerce',
    'bulshada': 'social',
    'xog': 'data',
    'caruurtii': 'children',
    'dhaqaale': 'finance',
    'ganacsiga': 'business'
}

# Common typos and corrections
COMMON_TYPOS = {
    'artficial': 'artificial',
    'artifical': 'artificial',
    'inteligence': 'intelligence',
    'intelligense': 'intelligence',
    'machien': 'machine',
    'machin': 'machine',
    'lerning': 'learning',
    'learnin': 'learning',
    'securtiy': 'security',
    'securty': 'security',
    'blokchain': 'blockchain',
    'blockchan': 'blockchain',
    'devlopment': 'development',
    'developement': 'development',
    'moble': 'mobile',
    'mobil': 'mobile',
    'aplication': 'application',
    'applicaton': 'application',
    'websit': 'website',
    'webste': 'website',
    'databse': 'database',
    'datbase': 'database',
    'analitics': 'analytics',
    'analystics': 'analytics',
    'helth': 'health',
    'healtcare': 'healthcare',
    'educaton': 'education',
    'eductaion': 'education',
    'finace': 'finance',
    'financ': 'finance',
    'automaton': 'automation',
    'automatoin': 'automation',
    'proyect': 'project',
    'projct': 'project',
    'idaes': 'ideas',
    'ideaas': 'ideas'
}

def correct_typos(text: str) -> str:
    """Correct common typos using fuzzy matching."""
    words = text.lower().split()
    corrected = []
    
    for word in words:
        # First check exact typo mappings
        if word in COMMON_TYPOS:
            corrected.append(COMMON_TYPOS[word])
        else:
            # Use fuzzy matching for close matches
            best_match = None
            best_score = 0
            all_known_words = list(COMMON_TYPOS.values()) + list(TOPIC_SYNONYMS.keys())
            
            for known_word in all_known_words:
                score = fuzz.ratio(word, known_word)
                if score > 85 and score > best_score:  # High threshold to avoid false corrections
                    best_match = known_word
                    best_score = score
            
            corrected.append(best_match if best_match else word)
    
    return ' '.join(corrected)

def translate_somali(text: str) -> str:
    """Translate Somali words to English equivalents."""
    words = text.lower().split()
    translated = []
    
    for word in words:
        if word in SOMALI_MAPPINGS:
            translated.append(SOMALI_MAPPINGS[word])
        else:
            # Fuzzy match Somali words
            match = process.extractOne(word, list(SOMALI_MAPPINGS.keys()), score_cutoff=80)
            if match:
                translated.append(SOMALI_MAPPINGS[match[0]])
            else:
                translated.append(word)
    
    return ' '.join(translated)

def expand_synonyms(text: str) -> List[str]:
    """Expand a query to include synonym variations."""
    expanded = [text]
    text_lower = text.lower()
    
    for main_topic, synonyms in TOPIC_SYNONYMS.items():
        # If query contains main topic, add synonyms
        if main_topic in text_lower:
            for syn in synonyms[:3]:  # Limit to top 3 synonyms
                expanded.append(text_lower.replace(main_topic, syn))
        # If query contains a synonym, add main topic
        for syn in synonyms:
            if syn in text_lower:
                expanded.append(text_lower.replace(syn, main_topic))
                break
    
    return list(set(expanded))[:5]  # Return max 5 variations

def normalize_text(text: str) -> str:
    """Full text normalization pipeline."""
    # Step 1: Lowercase
    text = text.lower().strip()
    
    # Step 2: Translate Somali words
    text = translate_somali(text)
    
    # Step 3: Correct typos
    text = correct_typos(text)
    
    # Step 4: Remove special characters but keep spaces
    text = re.sub(r'[^a-zA-Z0-9\s]', ' ', text)
    
    # Step 5: Normalize whitespace
    text = ' '.join(text.split())
    
    return text

def detect_conversational_intent(query: str) -> Tuple[Optional[str], float]:
    """
    Advanced conversational intent detection using semantic matching.
    Returns (intent_type, confidence_score) or (None, 0) if no match.
    """
    query_lower = query.lower().strip()
    query_normalized = re.sub(r'[^\w\s]', '', query_lower)  # Remove punctuation for matching
    
    best_intent = None
    best_score = 0.0
    
    for intent_type, patterns in CONVERSATIONAL_PATTERNS.items():
        for pattern in patterns:
            pattern_normalized = re.sub(r'[^\w\s]', '', pattern.lower())
            
            # Exact match (highest priority)
            if query_normalized == pattern_normalized:
                return intent_type, 1.0
            
            # Query starts with pattern (e.g., "hi there" starts with "hi")
            if query_normalized.startswith(pattern_normalized + ' ') or query_normalized == pattern_normalized:
                score = 0.95
                if score > best_score:
                    best_score = score
                    best_intent = intent_type
            
            # Pattern is contained in query (e.g., "how are you today" contains "how are you")
            if pattern_normalized in query_normalized:
                # Longer patterns get higher scores (more specific)
                score = 0.85 + (len(pattern_normalized) / 100)
                if score > best_score:
                    best_score = score
                    best_intent = intent_type
            
            # Fuzzy matching for typos
            similarity = fuzz.ratio(query_normalized, pattern_normalized)
            if similarity > 80:
                score = similarity / 100
                if score > best_score:
                    best_score = score
                    best_intent = intent_type
            
            # Partial fuzzy match
            partial_sim = fuzz.partial_ratio(query_normalized, pattern_normalized)
            if partial_sim > 90 and len(pattern_normalized) > 5:
                score = (partial_sim / 100) * 0.8
                if score > best_score:
                    best_score = score
                    best_intent = intent_type
    
    return best_intent, best_score

def get_conversational_response(intent: str, query: str = "") -> str:
    """Get a contextual response for conversational intents."""
    
    # Special handling for "how are you" type questions
    query_lower = query.lower()
    if any(phrase in query_lower for phrase in ['how are you', 'how r u', 'how are u', 'how you doing', 'hru']):
        return random.choice(CONVERSATIONAL_RESPONSES['wellbeing_response'])
    
    # Map intents to response categories
    intent_response_map = {
        'greeting': 'greeting',
        'wellbeing_question': 'wellbeing_response',
        'about_ai': 'about_ai',
        'thanks': 'thanks',
        'goodbye': 'goodbye',
        'positive_feedback': 'positive_feedback',
        'negative_feedback': 'negative_feedback',
        'help_request': 'help_request',
        'joke_request': 'joke_request',
        'compliment': 'compliment',
        'apology': 'apology',
        'frustration': 'frustration',
        'boredom': 'boredom',
    }
    
    response_key = intent_response_map.get(intent, 'unclear')
    responses = CONVERSATIONAL_RESPONSES.get(response_key, CONVERSATIONAL_RESPONSES['unclear'])
    
    return random.choice(responses)

def is_project_search_query(query: str) -> bool:
    """Determine if the query is looking for project ideas."""
    query_lower = query.lower()
    
    # Explicit project search indicators
    project_keywords = [
        'project', 'projects', 'idea', 'ideas', 'topic', 'topics',
        'graduation', 'thesis', 'capstone', 'final year',
        'suggest', 'recommend', 'find', 'search', 'show me', 'give me',
        'looking for', 'interested in', 'want to work on', 'want to build',
    ]
    
    # Check if query contains project-related keywords
    for keyword in project_keywords:
        if keyword in query_lower:
            return True
    
    # Check if query is just a technology topic (likely searching)
    tech_topics = list(TOPIC_SYNONYMS.keys())
    for topic in tech_topics:
        if topic == query_lower.strip() or query_lower.strip() in TOPIC_SYNONYMS.get(topic, []):
            return True
    
    return False

def call_gemini_api(prompt: str, context: str = "") -> Optional[str]:
    """Call Gemini API for complex queries that need AI generation."""
    try:
        system_prompt = f"""You are {AI_NAME}, a friendly and helpful Academic Project Assistant for Hormuud University students.
Your personality: warm, encouraging, knowledgeable, and supportive.
You help students find graduation project ideas and guide their academic journey.
Keep responses concise (2-3 sentences max) and always be helpful.
If the query is about projects, suggest they search for specific topics like AI, Web, IoT, etc.
{context}"""

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": f"{system_prompt}\n\nUser: {prompt}\n\nAssistant:"}
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 200,
            }
        }
        
        response = requests.post(
            f"{GEMINI_API_URL}?key={GEMINI_API_KEY}",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if 'candidates' in data and len(data['candidates']) > 0:
                return data['candidates'][0]['content']['parts'][0]['text']
        
        return None
    except Exception as e:
        print(f"Gemini API error: {e}")
        return None

def extract_intent_and_topic(query: str) -> Tuple[str, str]:
    """Extract user intent and topic from natural language query."""
    query_lower = query.lower().strip()
    
    # FIRST: Check for conversational patterns (highest priority)
    conv_intent, conv_score = detect_conversational_intent(query)
    if conv_intent and conv_score > 0.7:
        return conv_intent, ""
    
    # SECOND: Check if it's a project search query
    if is_project_search_query(query):
        # Extract the topic
        topic = extract_search_topic(query)
        return 'search', topic
    
    # THIRD: Check for conversational with lower threshold
    if conv_intent and conv_score > 0.5:
        return conv_intent, ""
    
    # DEFAULT: Treat short queries as potential topics, long ones as unclear
    words = query_lower.split()
    if len(words) <= 3:
        # Short query - might be a topic
        return 'search', query_lower
    else:
        # Longer query - try to understand
        return 'unclear', query_lower

def extract_search_topic(query: str) -> str:
    """Extract the search topic from a project search query."""
    query_lower = query.lower()
    
    # Remove common filler words
    filler_words = [
        'a', 'an', 'the', 'some', 'any', 'project', 'projects', 'idea', 'ideas',
        'topic', 'topics', 'please', 'can', 'you', 'show', 'me', 'find', 'search',
        'for', 'about', 'related', 'to', 'give', 'get', 'want', 'need', 'looking',
        'interested', 'in', 'i', 'am', 'would', 'like', 'could', 'help', 'with',
        'suggest', 'recommend', 'graduation', 'thesis', 'capstone', 'final', 'year',
        'work', 'on', 'build', 'create', 'make', 'do', 'something', 'anything',
        'tell', 'what', 'which', 'are', 'is', 'there', 'have', 'has', 'been',
    ]
    
    words = query_lower.split()
    topic_words = [w for w in words if w not in filler_words and len(w) > 1]
    
    return ' '.join(topic_words) if topic_words else query_lower

def fuzzy_match_topic(query: str, available_topics: List[str], threshold: int = 70) -> List[Tuple[str, int]]:
    """Find topics that fuzzy match the query."""
    matches = []
    query_words = query.lower().split()
    
    for topic in available_topics:
        topic_lower = topic.lower()
        # Direct substring match
        if query.lower() in topic_lower or topic_lower in query.lower():
            matches.append((topic, 100))
            continue
        
        # Word-level fuzzy matching
        for word in query_words:
            score = fuzz.partial_ratio(word, topic_lower)
            if score >= threshold:
                matches.append((topic, score))
                break
    
    # Sort by score descending
    matches.sort(key=lambda x: x[1], reverse=True)
    return matches

# In-memory storage for demo (replace with database in production)
project_embeddings = {}

# Smart AI Chat storage - stores project knowledge bases
project_knowledge_bases = {}

# Lazy load sentence transformer model
_sentence_model = None
def get_sentence_model():
    global _sentence_model
    if _sentence_model is None:
        from sentence_transformers import SentenceTransformer
        _sentence_model = SentenceTransformer(MODEL_NAME)
    return _sentence_model

def get_text_embedding(text: str) -> np.ndarray:
    """Get embedding for a text using the sentence transformer model."""
    model = get_sentence_model()
    return model.encode(text)

# Sample data for demonstration
SAMPLE_SUPERVISORS = [
    {"id": "1", "name": "Dr. Ahmed Ali", "expertise": ["Machine Learning", "AI", "Data Science"], "max_students": 5, "current_students": 2},
    {"id": "2", "name": "Dr. Aisha Mohamed", "expertise": ["Web Development", "Software Engineering", "Cloud Computing"], "max_students": 4, "current_students": 1},
    {"id": "3", "name": "Dr. Omar Hassan", "expertise": ["Cybersecurity", "Networks", "Blockchain"], "max_students": 3, "current_students": 0},
]

# Helper Functions
def allowed_file(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def preprocess_text(text: str) -> str:
    """Basic text preprocessing."""
    # Convert to lowercase and remove special characters
    text = text.lower()
    text = re.sub(r'[^a-zA-Z0-9\s]', '', text)
    return text

def calculate_similarity(text1: str, text2: str) -> float:
    """
    Calculate semantic similarity between two texts using sentence embeddings only.
    Returns the raw cosine similarity score between 0 and 1 for normal cases.
    """
    try:
        return compare_semantic_texts(
            text1,
            text2,
            debug=os.environ.get('SIMILARITY_DEBUG') == 'true'
        )["raw_cosine_similarity"]
    except Exception as e:
        print(f"Error calculating similarity: {e}")
        return 0.0

def calculate_concept_similarity(text1: str, text2: str) -> float:
    """Extract and compare key concepts/features from both texts."""
    # Key academic project concepts to look for
    concept_patterns = {
        'examination': ['exam', 'examination', 'test', 'quiz', 'assessment', 'evaluation'],
        'online_platform': ['online', 'web', 'digital', 'platform', 'system', 'portal'],
        'authentication': ['login', 'authentication', 'user', 'admin', 'secure', 'password'],
        'automation': ['automatic', 'automated', 'auto', 'system-driven'],
        'grading': ['grading', 'scoring', 'evaluation', 'marks', 'grade', 'score'],
        'timing': ['timed', 'time', 'timer', 'duration', 'deadline'],
        'questions': ['question', 'quiz', 'bank', 'repository'],
        'results': ['result', 'report', 'analysis', 'performance', 'analytics'],
        'security': ['security', 'secure', 'anti-cheat', 'integrity', 'monitoring', 'cheating'],
        'management': ['management', 'manage', 'administer', 'conduct'],
        'student': ['student', 'learner', 'candidate', 'participant'],
        'instructor': ['instructor', 'teacher', 'admin', 'administrator'],
    }
    
    text1_lower = text1.lower()
    text2_lower = text2.lower()
    
    concepts1 = set()
    concepts2 = set()
    
    for concept, keywords in concept_patterns.items():
        for keyword in keywords:
            if keyword in text1_lower:
                concepts1.add(concept)
            if keyword in text2_lower:
                concepts2.add(concept)
    
    if not concepts1 or not concepts2:
        return 0.0
    
    # Jaccard similarity of concepts
    intersection = len(concepts1 & concepts2)
    union = len(concepts1 | concepts2)
    
    return intersection / union if union > 0 else 0.0

def calculate_tech_similarity(text1: str, text2: str) -> float:
    """Compare technology stacks mentioned in both texts."""
    technologies = [
        'php', 'mysql', 'javascript', 'python', 'java', 'react', 'angular', 'vue',
        'node', 'express', 'django', 'flask', 'mongodb', 'postgresql', 'html', 'css',
        'bootstrap', 'tailwind', 'typescript', 'c#', '.net', 'spring', 'laravel'
    ]
    
    text1_lower = text1.lower()
    text2_lower = text2.lower()
    
    tech1 = set(t for t in technologies if t in text1_lower)
    tech2 = set(t for t in technologies if t in text2_lower)
    
    if not tech1 or not tech2:
        return 0.0
    
    intersection = len(tech1 & tech2)
    union = len(tech1 | tech2)
    
    return intersection / union if union > 0 else 0.0

def get_domain_boost(text1: str, text2: str) -> float:
    """Give a boost if both projects are clearly in the same domain."""
    domains = {
        'examination': ['exam', 'examination', 'test', 'quiz', 'assessment', 'grading', 'scoring'],
        'ecommerce': ['shop', 'store', 'cart', 'product', 'order', 'payment', 'ecommerce'],
        'healthcare': ['health', 'medical', 'patient', 'doctor', 'hospital', 'clinic'],
        'education': ['learning', 'course', 'student', 'teacher', 'school', 'education', 'lms'],
        'social': ['social', 'chat', 'message', 'friend', 'post', 'comment', 'network'],
        'finance': ['bank', 'finance', 'payment', 'transaction', 'money', 'account'],
        'inventory': ['inventory', 'stock', 'warehouse', 'product', 'supply'],
    }
    
    text1_lower = text1.lower()
    text2_lower = text2.lower()
    
    for domain, keywords in domains.items():
        matches1 = sum(1 for k in keywords if k in text1_lower)
        matches2 = sum(1 for k in keywords if k in text2_lower)
        
        # If both texts have 3+ keywords from the same domain, they're likely similar
        if matches1 >= 3 and matches2 >= 3:
            return 0.15  # 15% boost
    
    return 0.0

def generate_project_ideas(interests: str, count: int = 5) -> List[Dict[str, Any]]:
    """Generate project ideas based on interests."""
    # In a real implementation, this would use a more sophisticated approach
    # This is a simplified version for demonstration
    interests_list = [i.strip() for i in interests.split(',')]
    ideas = []
    
    for i in range(count):
        idea = {
            "id": str(uuid.uuid4()),
            "title": f"{interests_list[i % len(interests_list)]} Project {i+1}",
            "description": f"A project focusing on {interests_list[i % len(interests_list)]} with innovative approaches.",
            "difficulty": np.random.choice(["Beginner", "Intermediate", "Advanced"]),
            "technologies": ["Python", "JavaScript", "React"][:np.random.randint(1, 4)],
            "similarity_score": round(np.random.uniform(0, 0.3), 2)
        }
        ideas.append(idea)
    
    return ideas

def recommend_supervisors(project_title: str, project_description: str, top_n: int = 3) -> List[Dict[str, Any]]:
    """Recommend supervisors based on project details."""
    project_text = f"{project_title}. {project_description}"
    project_embedding = get_text_embedding(project_text)
    
    # Calculate similarity with each supervisor's expertise
    for supervisor in SAMPLE_SUPERVISORS:
        expertise_text = ", ".join(supervisor["expertise"])
        supervisor_embedding = get_text_embedding(expertise_text)
        similarity = cosine_similarity(
            project_embedding.reshape(1, -1),
            supervisor_embedding.reshape(1, -1)
        )[0][0]
        supervisor["match_score"] = float(similarity)
    
    # Filter out supervisors who have reached capacity and sort by match score
    available_supervisors = [
        s for s in SAMPLE_SUPERVISORS 
        if s["current_students"] < s["max_students"]
    ]
    available_supervisors.sort(key=lambda x: x["match_score"], reverse=True)
    
    return available_supervisors[:top_n]

SIMILARITY_RISK_EXPLANATIONS = {
    "Low": "The projects have limited similarity and normally do not require additional investigation.",
    "Medium": "The projects contain noticeable similarities and should be reviewed by a supervisor or administrator.",
    "High": "The projects are highly similar and require careful academic review before approval.",
}

SIMILARITY_RISK_RANGES = {
    "Low": "0-39%",
    "Medium": "40-69%",
    "High": "70-100%",
}

def similarity_risk_from_score(score: float) -> str:
    """Classify a percentage score for analysis only; this does not change stored project status."""
    if score >= 70:
        return "High"
    if score >= 40:
        return "Medium"
    return "Low"

def analyze_similarity_results(comparisons: List[Dict[str, Any]], risk_filter: Optional[str] = None) -> Dict[str, Any]:
    """Use NumPy to calculate summary statistics for existing similarity comparison rows."""
    normalized_rows = []
    for item in comparisons:
        try:
            score = float(item.get("similarityPercentage", item.get("score", 0)) or 0)
        except (TypeError, ValueError):
            score = 0
        score = float(np.clip(score, 0, 100))
        risk_level = similarity_risk_from_score(score)
        if risk_filter and risk_filter != risk_level:
            continue
        normalized_rows.append({
            **item,
            "similarityPercentage": round(score, 2),
            "riskLevel": risk_level,
            "riskLabel": f"{risk_level} Risk",
        })

    scores = np.array([row["similarityPercentage"] for row in normalized_rows], dtype=float)
    total = int(scores.size)
    low_count = int(np.sum((scores >= 0) & (scores < 40))) if total else 0
    medium_count = int(np.sum((scores >= 40) & (scores < 70))) if total else 0
    high_count = int(np.sum((scores >= 70) & (scores <= 100))) if total else 0

    risk_counts = {
        "Low": low_count,
        "Medium": medium_count,
        "High": high_count,
    }

    risk_categories = []
    for key in ["Low", "Medium", "High"]:
        count = risk_counts[key]
        percentage = round((count / total) * 100, 2) if total else 0
        risk_categories.append({
            "riskLevel": key,
            "label": f"{key} Risk",
            "range": SIMILARITY_RISK_RANGES[key],
            "count": count,
            "percentage": percentage,
            "explanation": SIMILARITY_RISK_EXPLANATIONS[key],
        })

    sorted_rows = sorted(normalized_rows, key=lambda row: row["similarityPercentage"], reverse=True)
    top_pairs = [{
        "pair": row.get("pairLabel") or f"{row.get('firstProjectTitle', 'Project')} vs {row.get('secondProjectTitle', 'Project')}",
        "similarityPercentage": row["similarityPercentage"],
        "riskLevel": row["riskLevel"],
    } for row in sorted_rows[:10]]

    return {
        "summary": {
            "totalComparisons": total,
            "averageSimilarity": round(float(np.mean(scores)), 2) if total else 0,
            "highestSimilarity": round(float(np.max(scores)), 2) if total else 0,
            "lowestSimilarity": round(float(np.min(scores)), 2) if total else 0,
            "medianSimilarity": round(float(np.median(scores)), 2) if total else 0,
            "standardDeviation": round(float(np.std(scores)), 2) if total else 0,
            "riskCounts": risk_counts,
        },
        "riskCategories": risk_categories,
        "comparisons": sorted_rows,
        "charts": {
            "riskBar": [
                {"name": category["label"], "count": category["count"], "riskLevel": category["riskLevel"]}
                for category in risk_categories
            ],
            "riskDistribution": [
                {"name": category["label"], "value": category["count"], "percentage": category["percentage"], "riskLevel": category["riskLevel"]}
                for category in risk_categories
            ],
            "topPairs": top_pairs,
        },
        "decisionSupportNotice": "Similarity risk is decision-support information only. It must not be treated as an automatic plagiarism or duplication decision.",
    }

ANALYSIS_REPORT_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "analysis_reports")
os.makedirs(ANALYSIS_REPORT_FOLDER, exist_ok=True)
ALL_PROJECT_RESPONSE_ROW_LIMIT = 500
PDF_TABLE_ROW_LIMIT = 100

def short_label(title: str, index: int, max_length: int = 28) -> str:
    cleaned = re.sub(r"\s+", " ", str(title or f"Project {index + 1}")).strip()
    if len(cleaned) <= max_length:
        return cleaned
    return f"{cleaned[:max_length - 3]}..."

def report_url(filename: str) -> str:
    base_url = request.host_url.rstrip("/")
    return f"{base_url}/api/ai/similarity-results/reports/{filename}"

def normalize_project_embeddings(projects: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], np.ndarray]:
    valid_projects = []
    vectors = []
    expected_dimensions = None

    for project in projects:
        vector = np.array(project.get("embedding") or [], dtype=float)
        if vector.size == 0:
            continue
        if expected_dimensions is None:
            expected_dimensions = vector.size
        if vector.size != expected_dimensions:
            continue
        norm = np.linalg.norm(vector)
        if norm == 0:
            continue
        valid_projects.append(project)
        vectors.append(vector / norm)

    if not vectors:
      return [], np.empty((0, 0), dtype=float)

    return valid_projects, np.vstack(vectors)

def project_matches_scope(project: Dict[str, Any], filters: Dict[str, Any]) -> bool:
    faculty_id = filters.get("facultyId") or ""
    department_id = filters.get("departmentId") or ""
    if faculty_id and str(project.get("facultyId") or "") != str(faculty_id):
        return False
    if department_id and str(project.get("departmentId") or "") != str(department_id):
        return False
    return True

def pair_matches_filters(row: Dict[str, Any], filters: Dict[str, Any]) -> bool:
    risk_level = filters.get("riskLevel") or ""
    title = (filters.get("title") or "").strip().lower()
    faculty_id = filters.get("facultyId") or ""
    department_id = filters.get("departmentId") or ""
    start_date = filters.get("startDate") or ""
    end_date = filters.get("endDate") or ""

    if risk_level and row["riskLevel"] != risk_level:
        return False
    if title and title not in row["project1Title"].lower() and title not in row["project2Title"].lower():
        return False
    if faculty_id and row["project1FacultyId"] != faculty_id and row["project2FacultyId"] != faculty_id:
        return False
    if department_id and row["project1DepartmentId"] != department_id and row["project2DepartmentId"] != department_id:
        return False
    if start_date and row["comparisonDate"][:10] < start_date:
        return False
    if end_date and row["comparisonDate"][:10] > end_date:
        return False
    return True

def create_empty_chart(filename: str, title: str, message: str):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    path = os.path.join(ANALYSIS_REPORT_FOLDER, filename)
    fig, ax = plt.subplots(figsize=(8, 4.5))
    ax.axis("off")
    ax.set_title(title, fontsize=14, fontweight="bold")
    ax.text(0.5, 0.5, message, ha="center", va="center", fontsize=11)
    fig.tight_layout()
    fig.savefig(path, dpi=160, bbox_inches="tight")
    plt.close(fig)
    return path

def create_all_project_charts(projects: List[Dict[str, Any]], matrix: np.ndarray, pair_rows: List[Dict[str, Any]], summary: Dict[str, Any]) -> Dict[str, str]:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_pdf import PdfPages

    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    token = uuid.uuid4().hex[:8]
    prefix = f"all-project-similarity-{timestamp}-{token}"

    labels = [short_label(project.get("title"), index) for index, project in enumerate(projects)]
    heatmap_file = f"{prefix}-heatmap.png"
    top_pairs_file = f"{prefix}-top-pairs.png"
    risk_file = f"{prefix}-risk-distribution.png"
    histogram_file = f"{prefix}-histogram.png"
    matrix_csv_file = f"{prefix}-matrix.csv"
    comparisons_csv_file = f"{prefix}-comparisons.csv"
    pdf_file = f"{prefix}-report.pdf"

    heatmap_path = os.path.join(ANALYSIS_REPORT_FOLDER, heatmap_file)
    top_pairs_path = os.path.join(ANALYSIS_REPORT_FOLDER, top_pairs_file)
    risk_path = os.path.join(ANALYSIS_REPORT_FOLDER, risk_file)
    histogram_path = os.path.join(ANALYSIS_REPORT_FOLDER, histogram_file)
    matrix_csv_path = os.path.join(ANALYSIS_REPORT_FOLDER, matrix_csv_file)
    comparisons_csv_path = os.path.join(ANALYSIS_REPORT_FOLDER, comparisons_csv_file)
    pdf_path = os.path.join(ANALYSIS_REPORT_FOLDER, pdf_file)

    display_matrix = matrix.copy()
    if display_matrix.size:
        np.fill_diagonal(display_matrix, np.nan)

    try:
        import pandas as pd
    except ImportError as exc:
        raise RuntimeError("Pandas is required for all-project similarity reports. Install python-ai requirements.") from exc

    matrix_df = pd.DataFrame(display_matrix, index=labels, columns=labels)
    pairs_df = pd.DataFrame(pair_rows)
    matrix_df.to_csv(matrix_csv_path)
    pairs_df.to_csv(comparisons_csv_path, index=False)

    if len(projects) >= 2 and display_matrix.size:
        size = max(7, min(18, 3.8 + (len(projects) * 0.45)))
        fig, ax = plt.subplots(figsize=(size, size))
        im = ax.imshow(display_matrix, cmap="RdYlGn_r", vmin=0, vmax=100)
        ax.set_xticks(np.arange(len(labels)))
        ax.set_yticks(np.arange(len(labels)))
        ax.set_xticklabels(labels, rotation=45, ha="right", fontsize=8)
        ax.set_yticklabels(labels, fontsize=8)
        ax.set_title("All Projects Similarity Matrix Heatmap", fontsize=14, fontweight="bold")
        if len(projects) <= 14:
            for row_idx in range(len(projects)):
                for col_idx in range(len(projects)):
                    value = display_matrix[row_idx, col_idx]
                    if not np.isnan(value):
                        ax.text(col_idx, row_idx, f"{value:.0f}%", ha="center", va="center", fontsize=7)
        cbar = fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
        cbar.set_label("Similarity %")
        fig.tight_layout()
        fig.savefig(heatmap_path, dpi=180, bbox_inches="tight")
        plt.close(fig)
    else:
        create_empty_chart(heatmap_file, "All Projects Similarity Matrix Heatmap", "At least two valid projects are required.")

    top_pairs = pair_rows[:10]
    if top_pairs:
        fig, ax = plt.subplots(figsize=(10, max(4.5, len(top_pairs) * 0.55)))
        labels_top = [f"{row['project1ShortTitle']} vs {row['project2ShortTitle']}" for row in reversed(top_pairs)]
        values_top = [row["similarityPercentage"] for row in reversed(top_pairs)]
        colors_top = [row["riskColor"] for row in reversed(top_pairs)]
        ax.barh(labels_top, values_top, color=colors_top)
        ax.set_xlim(0, 100)
        ax.set_xlabel("Similarity %")
        ax.set_title("Top 10 Highest Similarity Project Pairs", fontsize=14, fontweight="bold")
        for index, value in enumerate(values_top):
            ax.text(min(value + 1, 98), index, f"{value:.1f}%", va="center", fontsize=9)
        fig.tight_layout()
        fig.savefig(top_pairs_path, dpi=180, bbox_inches="tight")
        plt.close(fig)
    else:
        create_empty_chart(top_pairs_file, "Top 10 Highest Similarity Project Pairs", "No project comparisons match the selected filters.")

    risk_counts = summary["riskCounts"]
    fig, ax = plt.subplots(figsize=(7, 4.5))
    risk_names = ["Low", "Medium", "High"]
    risk_values = [risk_counts.get(name, 0) for name in risk_names]
    risk_colors = ["#22c55e", "#f59e0b", "#ef4444"]
    ax.bar([f"{name} Risk" for name in risk_names], risk_values, color=risk_colors)
    ax.set_ylabel("Number of Comparisons")
    ax.set_title("Risk Distribution", fontsize=14, fontweight="bold")
    for index, value in enumerate(risk_values):
        ax.text(index, value + 0.05, str(value), ha="center", va="bottom", fontweight="bold")
    fig.tight_layout()
    fig.savefig(risk_path, dpi=180, bbox_inches="tight")
    plt.close(fig)

    scores = [row["similarityPercentage"] for row in pair_rows]
    if scores:
        fig, ax = plt.subplots(figsize=(8, 4.8))
        ax.hist(scores, bins=np.arange(0, 105, 5), color="#2563eb", edgecolor="white")
        ax.set_xlabel("Similarity %")
        ax.set_ylabel("Number of Comparisons")
        ax.set_title("Similarity Score Distribution", fontsize=14, fontweight="bold")
        ax.set_xlim(0, 100)
        fig.tight_layout()
        fig.savefig(histogram_path, dpi=180, bbox_inches="tight")
        plt.close(fig)
    else:
        create_empty_chart(histogram_file, "Similarity Score Distribution", "No project comparisons match the selected filters.")

    with PdfPages(pdf_path) as pdf:
        fig, ax = plt.subplots(figsize=(8.27, 11.69))
        ax.axis("off")
        summary_lines = [
            "All Projects Similarity Analysis Report",
            "",
            f"Generated: {summary['generatedAt']}",
            f"Total projects analysed: {summary['totalProjectsAnalysed']}",
            f"Expected unique comparisons: {summary['expectedUniqueComparisons']}",
            f"Actual comparisons completed: {summary['actualComparisonsCompleted']}",
            f"Filtered comparisons shown: {summary['filteredComparisons']}",
            f"Average similarity: {summary['averageSimilarity']}%",
            f"Median similarity: {summary['medianSimilarity']}%",
            f"Highest similarity: {summary['highestSimilarity']}%",
            f"Lowest similarity: {summary['lowestSimilarity']}%",
            f"Standard deviation: {summary['standardDeviation']}",
            f"Low risk: {summary['riskCounts']['Low']}",
            f"Medium risk: {summary['riskCounts']['Medium']}",
            f"High risk: {summary['riskCounts']['High']}",
            "",
            "Decision-support notice:",
            "High Risk does not automatically mean plagiarism or duplication.",
            "The final decision belongs to the supervisor or administrator.",
        ]
        ax.text(0.06, 0.95, "\n".join(summary_lines), va="top", fontsize=12)
        pdf.savefig(fig, bbox_inches="tight")
        plt.close(fig)

        for path, title in [
            (heatmap_path, "Similarity Matrix Heatmap"),
            (top_pairs_path, "Highest Similarity Project Pairs"),
            (risk_path, "Risk Distribution"),
            (histogram_path, "Similarity Score Distribution"),
        ]:
            fig, ax = plt.subplots(figsize=(11.69, 8.27))
            ax.axis("off")
            ax.set_title(title, fontsize=14, fontweight="bold")
            image = plt.imread(path)
            ax.imshow(image)
            pdf.savefig(fig, bbox_inches="tight")
            plt.close(fig)

        if not pairs_df.empty:
            table_columns = ["project1Title", "project2Title", "similarityPercentage", "riskLabel", "faculty", "department", "academicYear"]
            rows_per_page = 24
            table_df = pairs_df[table_columns].head(PDF_TABLE_ROW_LIMIT)
            total_pages = int(np.ceil(len(table_df) / rows_per_page))
            for page_index in range(total_pages):
                chunk = table_df.iloc[page_index * rows_per_page:(page_index + 1) * rows_per_page]
                fig, ax = plt.subplots(figsize=(11.69, 8.27))
                ax.axis("off")
                ax.set_title(f"Detailed Comparison Table ({page_index + 1}/{total_pages})", fontsize=14, fontweight="bold")
                table = ax.table(cellText=chunk.values, colLabels=chunk.columns, loc="center", cellLoc="left")
                table.auto_set_font_size(False)
                table.set_fontsize(6.5)
                table.scale(1, 1.25)
                pdf.savefig(fig, bbox_inches="tight")
                plt.close(fig)

    return {
        "images": {
            "heatmap": report_url(heatmap_file),
            "topPairsBar": report_url(top_pairs_file),
            "riskDistribution": report_url(risk_file),
            "histogram": report_url(histogram_file),
        },
        "exports": {
            "comparisonsCsv": report_url(comparisons_csv_file),
            "matrixCsv": report_url(matrix_csv_file),
            "heatmapPng": report_url(heatmap_file),
            "topPairsPng": report_url(top_pairs_file),
            "riskDistributionPng": report_url(risk_file),
            "histogramPng": report_url(histogram_file),
            "pdfReport": report_url(pdf_file),
        }
    }

def analyze_all_projects_similarity(projects: List[Dict[str, Any]], filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    filters = filters or {}
    scoped_projects = [project for project in projects if project_matches_scope(project, filters)]
    valid_projects, embeddings = normalize_project_embeddings(scoped_projects)
    total_projects = len(valid_projects)
    expected_comparisons = int(total_projects * (total_projects - 1) / 2)
    generated_at = datetime.utcnow().isoformat() + "Z"

    if total_projects == 0:
        matrix = np.empty((0, 0), dtype=float)
    else:
        matrix = np.clip(np.matmul(embeddings, embeddings.T) * 100, 0, 100)

    all_pair_rows = []
    for i in range(total_projects):
        for j in range(i + 1, total_projects):
            score = round(float(matrix[i, j]), 2)
            risk_level = similarity_risk_from_score(score)
            first = valid_projects[i]
            second = valid_projects[j]
            faculty = first.get("facultyName") if first.get("facultyName") == second.get("facultyName") else " / ".join(filter(None, [first.get("facultyName"), second.get("facultyName")]))
            department = first.get("departmentName") if first.get("departmentName") == second.get("departmentName") else " / ".join(filter(None, [first.get("departmentName"), second.get("departmentName")]))
            academic_year = first.get("academicYear") if first.get("academicYear") == second.get("academicYear") else " / ".join(filter(None, [str(first.get("academicYear") or ""), str(second.get("academicYear") or "")]))
            all_pair_rows.append({
                "id": f"{first.get('id')}-{second.get('id')}",
                "project1Id": first.get("id"),
                "project2Id": second.get("id"),
                "project1Title": first.get("title") or "Untitled Project",
                "project2Title": second.get("title") or "Untitled Project",
                "project1ShortTitle": short_label(first.get("title"), i, 22),
                "project2ShortTitle": short_label(second.get("title"), j, 22),
                "similarityPercentage": score,
                "riskLevel": risk_level,
                "riskLabel": f"{risk_level} Risk",
                "riskColor": "#ef4444" if risk_level == "High" else "#f59e0b" if risk_level == "Medium" else "#22c55e",
                "faculty": faculty or "-",
                "department": department or "-",
                "academicYear": academic_year or "-",
                "comparisonDate": generated_at,
                "project1FacultyId": first.get("facultyId") or "",
                "project2FacultyId": second.get("facultyId") or "",
                "project1DepartmentId": first.get("departmentId") or "",
                "project2DepartmentId": second.get("departmentId") or "",
            })

    all_pair_rows.sort(key=lambda row: row["similarityPercentage"], reverse=True)
    filtered_pair_rows = [row for row in all_pair_rows if pair_matches_filters(row, filters)]
    filtered_pair_rows.sort(key=lambda row: row["similarityPercentage"], reverse=True)
    scores = np.array([row["similarityPercentage"] for row in filtered_pair_rows], dtype=float)
    total_filtered = int(scores.size)
    risk_counts = {
        "Low": int(np.sum((scores >= 0) & (scores < 40))) if total_filtered else 0,
        "Medium": int(np.sum((scores >= 40) & (scores < 70))) if total_filtered else 0,
        "High": int(np.sum((scores >= 70) & (scores <= 100))) if total_filtered else 0,
    }

    summary = {
        "generatedAt": generated_at,
        "totalProjectsAnalysed": total_projects,
        "expectedUniqueComparisons": expected_comparisons,
        "actualComparisonsCompleted": len(all_pair_rows),
        "filteredComparisons": total_filtered,
        "comparisonRowsReturned": min(total_filtered, ALL_PROJECT_RESPONSE_ROW_LIMIT),
        "isComplete": len(all_pair_rows) == expected_comparisons,
        "averageSimilarity": round(float(np.mean(scores)), 2) if total_filtered else 0,
        "medianSimilarity": round(float(np.median(scores)), 2) if total_filtered else 0,
        "highestSimilarity": round(float(np.max(scores)), 2) if total_filtered else 0,
        "lowestSimilarity": round(float(np.min(scores)), 2) if total_filtered else 0,
        "standardDeviation": round(float(np.std(scores)), 2) if total_filtered else 0,
        "riskCounts": risk_counts,
    }
    summary["completionWarning"] = "" if summary["isComplete"] else (
        f"Comparison count is incomplete. Expected {expected_comparisons}, completed {len(all_pair_rows)}."
    )

    chart_payload = create_all_project_charts(valid_projects, matrix, filtered_pair_rows, summary)

    risk_categories = []
    for key in ["Low", "Medium", "High"]:
        count = risk_counts[key]
        risk_categories.append({
            "riskLevel": key,
            "label": f"{key} Risk",
            "range": SIMILARITY_RISK_RANGES[key],
            "count": count,
            "percentage": round((count / total_filtered) * 100, 2) if total_filtered else 0,
            "explanation": SIMILARITY_RISK_EXPLANATIONS[key],
        })

    return {
        "summary": summary,
        "riskCategories": risk_categories,
        "comparisons": filtered_pair_rows[:ALL_PROJECT_RESPONSE_ROW_LIMIT],
        "matrix": {
            "labels": [project.get("title") for project in valid_projects],
            "values": np.nan_to_num(matrix, nan=0).round(2).tolist() if matrix.size else [],
        },
        "charts": {
            "topPairs": filtered_pair_rows[:10],
            "riskDistribution": [
                {"name": f"{key} Risk", "value": risk_counts[key], "riskLevel": key}
                for key in ["Low", "Medium", "High"]
            ],
        },
        **chart_payload,
        "decisionSupportNotice": "Similarity analysis supports academic decision-making only. High Risk does not automatically mean plagiarism or duplication.",
    }

# API Routes
@app.route('/api/health')
def health_check():
    return jsonify({"status": "healthy"})

@app.route('/api/ai/research/models', methods=['GET'])
def research_model_status():
    return jsonify({"status": "success", "data": research_model_registry.status()})

@app.route('/api/ai/research/project-comparison', methods=['POST'])
def research_project_comparison():
    data = request.get_json(silent=True) or {}
    if not isinstance(data.get("firstProject"), dict) or not isinstance(data.get("secondProject"), dict):
        return jsonify({"status": "error", "message": "firstProject and secondProject are required"}), 400
    try:
        result = compare_projects_multi_model(
            data["firstProject"], data["secondProject"], data.get("configuration")
        )
        return jsonify({"status": "success", "data": result})
    except ValueError as exc:
        return jsonify({"status": "error", "message": str(exc)}), 422
    except Exception as exc:
        app.logger.exception("Multi-model comparison failed")
        return jsonify({"status": "error", "message": str(exc)}), 500

@app.route('/api/ai/research/evaluate', methods=['POST'])
def research_evaluate():
    data = request.get_json(silent=True) or {}
    labels = data.get("labels") or []
    model_scores = data.get("modelScores") or {}
    if not labels or not isinstance(model_scores, dict):
        return jsonify({"status": "error", "message": "labels and modelScores are required"}), 400
    thresholds = data.get("thresholds") or DEFAULT_THRESHOLD_EXPERIMENTS
    human_scores = data.get("humanScores")
    times = data.get("processingTimes") or {}
    results = {}
    try:
        for model, scores in model_scores.items():
            model_threshold = float((data.get("classificationThresholds") or {}).get(model, 70))
            model_threshold_analysis = threshold_analysis(labels, scores, thresholds)
            results[model] = {
                "classification": classification_metrics(labels, scores, model_threshold),
                "threshold_analysis": model_threshold_analysis,
                "optimal_thresholds": optimal_thresholds(model_threshold_analysis),
                "processing": processing_metrics(times.get(model, [])),
            }
            if human_scores:
                results[model]["human_score_agreement"] = regression_metrics(human_scores, scores)
        results["statistical_tests"] = statistical_tests(
            labels,
            model_scores,
            data.get("classificationThresholds") or {},
            human_scores,
            float(data.get("significanceLevel") or 0.05),
        )
        def json_safe(value):
            if isinstance(value, dict):
                return {key: json_safe(item) for key, item in value.items()}
            if isinstance(value, (list, tuple)):
                return [json_safe(item) for item in value]
            if isinstance(value, np.generic):
                value = value.item()
            if isinstance(value, float) and not math.isfinite(value):
                return None
            return value

        return jsonify({"status": "success", "data": json_safe(results)})
    except (TypeError, ValueError) as exc:
        return jsonify({"status": "error", "message": str(exc)}), 422

@app.route('/api/ai/research/ranking-evaluation', methods=['POST'])
def research_ranking_evaluation():
    data = request.get_json(silent=True) or {}
    try:
        return jsonify({
            "status": "success",
            "data": evaluate_ranking(
                data.get("predictedSupervisorIds", []), data.get("expertRelevance", {})
            ),
        })
    except (TypeError, ValueError) as exc:
        return jsonify({"status": "error", "message": str(exc)}), 422

@app.route('/api/ai/research/batch-project-similarity', methods=['POST'])
def batch_project_similarity():
    data = request.get_json(silent=True) or {}
    projects = data.get("projects") or []
    if len(projects) < 2:
        return jsonify({"status": "error", "message": "At least two projects are required"}), 400
    try:
        return jsonify({"status": "success", "data": run_project_pair_experiment(projects, data.get("configuration"))})
    except Exception as exc:
        app.logger.exception("Batch project experiment failed")
        return jsonify({"status": "error", "message": str(exc)}), 500


@app.route('/api/ai/research/proposal-similarity', methods=['POST'])
def proposal_similarity():
    data = request.get_json(silent=True) or {}
    proposal = data.get("proposal")
    recorded_projects = data.get("recordedProjects") or []
    if not isinstance(proposal, dict):
        return jsonify({"status": "error", "message": "proposal is required"}), 400
    if not isinstance(recorded_projects, list) or not recorded_projects:
        return jsonify({"status": "error", "message": "recordedProjects are required"}), 400
    try:
        result = compare_proposal_to_recorded_projects(
            proposal,
            recorded_projects,
            data.get("configuration"),
        )
        return jsonify({"status": "success", "data": result})
    except ValueError as exc:
        return jsonify({"status": "error", "message": str(exc)}), 422
    except Exception as exc:
        app.logger.exception("Recorded-project proposal comparison failed")
        return jsonify({"status": "error", "message": str(exc)}), 500


@app.route('/api/ai/research/batch-supervisor-matching', methods=['POST'])
def batch_supervisor_matching():
    data = request.get_json(silent=True) or {}
    projects = data.get("projects") or []
    supervisors = data.get("supervisors") or []
    if not projects or not supervisors:
        return jsonify({"status": "error", "message": "Projects and supervisors are required"}), 400
    try:
        result = run_supervisor_matching_experiment(projects, supervisors, data.get("configuration"))
        return jsonify({"status": "success", "data": result})
    except Exception as exc:
        app.logger.exception("Batch supervisor experiment failed")
        return jsonify({"status": "error", "message": str(exc)}), 500

@app.route('/api/ai/similarity-results/analyze', methods=['POST'])
def analyze_similarity_results_endpoint():
    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON body is required"}), 400

    comparisons = data.get("comparisons")
    if not isinstance(comparisons, list):
        return jsonify({"error": "comparisons must be an array"}), 400

    try:
        result = analyze_similarity_results(comparisons, data.get("riskLevel") or data.get("risk"))
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/ai/similarity-results/all-projects', methods=['POST'])
def analyze_all_projects_similarity_endpoint():
    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON body is required"}), 400

    projects = data.get("projects")
    if not isinstance(projects, list):
        return jsonify({"error": "projects must be an array"}), 400

    try:
        result = analyze_all_projects_similarity(projects, data.get("filters") or {})
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/ai/similarity-results/reports/<path:filename>', methods=['GET'])
def serve_similarity_report_file(filename):
    return send_from_directory(ANALYSIS_REPORT_FOLDER, filename)

@app.route('/api/ai/similarity', methods=['POST'])
def check_similarity():
    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON body is required"}), 400
    
    try:
        debug = bool(data.get('debug')) or os.environ.get('SIMILARITY_DEBUG') == 'true'

        if data.get('project1') and data.get('project2'):
            result = compare_semantic_projects(data['project1'], data['project2'], debug=debug)
        else:
            text1 = data.get('text1')
            text2 = data.get('text2')
            if text1 is None:
                text1 = " ".join([
                    data.get('title1') or data.get('title') or '',
                    data.get('description1') or data.get('description') or data.get('abstract') or '',
                    " ".join(data.get('features1') or data.get('features') or [])
                ])
            if text2 is None:
                text2 = " ".join([
                    data.get('title2') or data.get('storedTitle') or '',
                    data.get('description2') or data.get('storedDescription') or data.get('storedAbstract') or '',
                    " ".join(data.get('features2') or data.get('storedFeatures') or [])
                ])
            if not text1 or not text2:
                return jsonify({"error": "Both text1/text2 or project1/project2 are required"}), 400
            result = compare_semantic_texts(
                text1,
                text2,
                project_id=data.get('project_id') or data.get('storedProjectId'),
                debug=debug
            )

        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/ai/generate-ideas', methods=['POST'])
def generate_ideas():
    data = request.get_json()
    if not data or 'interests' not in data:
        return jsonify({"error": "Interests are required"}), 400
    
    try:
        count = int(data.get('count', 5))
        ideas = generate_project_ideas(data['interests'], count)
        return jsonify({
            "ideas": ideas,
            "status": "success"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/ai/recommend-supervisors', methods=['POST'])
def get_supervisor_recommendations():
    data = request.get_json()
    if not data or 'project_title' not in data or 'project_description' not in data:
        return jsonify({"error": "Project title and description are required"}), 400
    
    try:
        top_n = int(data.get('top_n', 3))
        recommendations = recommend_supervisors(
            data['project_title'],
            data['project_description'],
            top_n
        )
        return jsonify({
            "recommendations": recommendations,
            "status": "success"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/ai/process-document', methods=['POST'])
def process_document():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)
        
        # In a real implementation, you would process the file here
        # For demo, we'll just return a mock response
        return jsonify({
            "status": "success",
            "filename": filename,
            "content_type": file.content_type,
            "size": os.path.getsize(filepath),
            "analysis": {
                "word_count": 1200,
                "key_topics": ["artificial intelligence", "machine learning", "data analysis"],
                "similarity_scores": {
                    "existing_projects": [
                        {"id": "proj1", "title": "AI Project 1", "similarity": 0.15},
                        {"id": "proj2", "title": "ML Project 2", "similarity": 0.12}
                    ]
                }
            }
        })
    
    return jsonify({"error": "File type not allowed"}), 400

# ============================================
# SMART AI CHAT ENDPOINTS (Sentence Transformers + FAISS)
# ============================================

@app.route('/api/ai/project/create', methods=['POST'])
def create_project_knowledge():
    """
    Create a knowledge base for a project.
    Input: project_name, project_details
    Returns: project_id for future chat queries
    """
    import faiss
    
    data = request.get_json()
    if not data or 'project_name' not in data or 'project_details' not in data:
        return jsonify({"error": "project_name and project_details are required"}), 400
    
    try:
        project_name = data['project_name']
        project_details = data['project_details']
        
        # Create documents from project data (ONLY knowledge source)
        documents = [
            f"The project name is {project_name}.",
            f"Project Title: {project_name}",
        ]
        
        # Split project details into sentences for better retrieval
        details_sentences = [s.strip() for s in project_details.replace('\n', '. ').split('.') if s.strip()]
        documents.extend(details_sentences)
        
        # Add combined context
        documents.append(f"{project_name}: {project_details}")
        
        # Create embeddings using sentence transformer
        model = get_sentence_model()
        embeddings = model.encode(documents)
        dimension = embeddings.shape[1]
        
        # Create FAISS index
        index = faiss.IndexFlatL2(dimension)
        index.add(np.array(embeddings).astype('float32'))
        
        # Generate project ID and store
        project_id = str(uuid.uuid4())
        project_knowledge_bases[project_id] = {
            'name': project_name,
            'details': project_details,
            'documents': documents,
            'embeddings': embeddings,
            'index': index
        }
        
        return jsonify({
            "status": "success",
            "project_id": project_id,
            "message": f"Knowledge base created for '{project_name}' with {len(documents)} document chunks"
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/ai/project/chat', methods=['POST'])
def chat_with_project():
    """
    Chat with a specific project's knowledge base.
    Input: project_id, question
    Returns: AI response based ONLY on project data
    """
    data = request.get_json()
    if not data or 'project_id' not in data or 'question' not in data:
        return jsonify({"error": "project_id and question are required"}), 400
    
    try:
        project_id = data['project_id']
        question = data['question']
        
        if project_id not in project_knowledge_bases:
            return jsonify({"error": "Project not found. Please create a project first."}), 404
        
        kb = project_knowledge_bases[project_id]
        model = get_sentence_model()
        
        # Encode the question
        q_embedding = model.encode([question])
        
        # Search in FAISS index
        distances, indices = kb['index'].search(np.array(q_embedding).astype('float32'), k=3)
        
        # Threshold for relevance (lower distance = more similar)
        if distances[0][0] < 1.5:
            # Get the most relevant documents
            relevant_docs = [kb['documents'][i] for i in indices[0] if i < len(kb['documents'])]
            response = " ".join(relevant_docs[:2])  # Combine top 2 results
            confidence = "high" if distances[0][0] < 0.8 else "medium"
        else:
            response = "I can only answer questions based on the project data you provided. Please ask something related to the project."
            confidence = "low"
        
        return jsonify({
            "status": "success",
            "response": response,
            "confidence": confidence,
            "project_name": kb['name']
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/ai/project/list', methods=['GET'])
def list_projects():
    """List all projects with knowledge bases."""
    projects = [
        {"id": pid, "name": kb['name']} 
        for pid, kb in project_knowledge_bases.items()
    ]
    return jsonify({"projects": projects})

@app.route('/api/ai/project/<project_id>', methods=['DELETE'])
def delete_project(project_id):
    """Delete a project's knowledge base."""
    if project_id in project_knowledge_bases:
        del project_knowledge_bases[project_id]
        return jsonify({"status": "success", "message": "Project deleted"})
    return jsonify({"error": "Project not found"}), 404

@app.route('/api/ai/generate-ideas-smart', methods=['POST'])
def generate_ideas_smart():
    """
    ULTRA-INTELLIGENT AI ASSISTANT v3.0
    
    Features:
    - Advanced conversational understanding (greetings, how are you, etc.)
    - Semantic intent detection with confidence scoring
    - Gemini API fallback for complex queries
    - Personality-driven responses
    - Multi-language support (English + Somali)
    - Typo correction and fuzzy matching
    """
    data = request.get_json()
    if not data or 'interests' not in data:
        return jsonify({"error": "interests are required"}), 400
    
    try:
        raw_query = data['interests'].strip()
        curated_ideas = data.get('curated_ideas', [])
        session_id = data.get('session_id', 'default')
        
        # Get available categories for suggestions
        available_categories = list(set([idea.get('category', '').lower() for idea in curated_ideas if idea.get('category')]))
        available_techs = list(set([tech.lower() for idea in curated_ideas for tech in idea.get('technologies', [])]))
        all_topics = list(set(available_categories + available_techs))[:8]
        topic_suggestions = ", ".join(all_topics) if all_topics else "AI, IoT, Web, Security, Mobile, Blockchain"
        
        # ========== STEP 1: CONVERSATIONAL INTENT DETECTION (HIGHEST PRIORITY) ==========
        
        conv_intent, conv_score = detect_conversational_intent(raw_query)
        
        # High confidence conversational intent - respond conversationally
        if conv_intent and conv_score >= 0.7:
            response_message = get_conversational_response(conv_intent, raw_query)
            
            return jsonify({
                "status": "success",
                "type": conv_intent,
                "message": response_message,
                "ideas": [],
                "understood_as": raw_query,
                "confidence": round(conv_score, 2),
                "ai_name": AI_NAME
            })
        
        # ========== STEP 2: NORMALIZE AND ANALYZE ==========
        
        normalized_query = normalize_text(raw_query)
        intent, extracted_topic = extract_intent_and_topic(raw_query)  # Use raw query for better intent detection
        
        # ========== STEP 3: HANDLE CONVERSATIONAL INTENTS ==========
        
        # Check if it's a conversational query (not a search)
        conversational_intents = ['greeting', 'thanks', 'goodbye', 'help_request', 
                                   'positive_feedback', 'negative_feedback', 'about_ai',
                                   'joke_request', 'compliment', 'apology', 'frustration', 'boredom']
        
        if intent in conversational_intents:
            response_message = get_conversational_response(intent, raw_query)
            return jsonify({
                "status": "success",
                "type": intent,
                "message": response_message,
                "ideas": [],
                "understood_as": normalized_query,
                "ai_name": AI_NAME
            })
        
        # ========== STEP 4: UNCLEAR QUERY - USE GEMINI FOR UNDERSTANDING ==========
        
        if intent == 'unclear' and len(raw_query.split()) > 3:
            # Try Gemini API for complex understanding
            gemini_response = call_gemini_api(
                raw_query,
                f"Available project topics: {topic_suggestions}. If the user is greeting or asking how you are, respond warmly. If they want project ideas, guide them to search for specific topics."
            )
            
            if gemini_response:
                return jsonify({
                    "status": "success",
                    "type": "ai_response",
                    "message": gemini_response,
                    "ideas": [],
                    "understood_as": normalized_query,
                    "ai_name": "Hormuud AI",
                    "powered_by": "hormuud-ai-v3"
                })
            
            # Fallback if Gemini fails
            return jsonify({
                "status": "success",
                "type": "clarification",
                "message": f"🤔 I want to understand you better!\n\nI heard: \"{raw_query}\"\n\nAre you:\n• 👋 Saying hello? (I'm happy to chat!)\n• 🔍 Looking for projects? (Tell me a topic like 'AI' or 'web')\n• ❓ Asking a question? (I'll do my best to help!)\n\n💡 **Try:** \"AI projects\" or \"show me IoT ideas\"",
                "ideas": [],
                "understood_as": normalized_query,
                "ai_name": AI_NAME
            })
        
        # ========== SEARCH FOR PROJECTS ==========
        
        if not curated_ideas:
            return jsonify({
                "status": "success",
                "ideas": [],
                "message": "📭 No curated ideas available yet. Please ask admin to add project ideas first.",
                "understood_as": normalized_query
            })
        
        model = get_sentence_model()
        
        # Step 4: Expand query with synonyms for better matching
        query_variations = expand_synonyms(extracted_topic if extracted_topic else normalized_query)
        
        # Encode all query variations
        all_query_embeddings = [model.encode([q])[0] for q in query_variations]
        
        # Search through curated ideas and find matches
        matching_ideas = []
        
        for curated in curated_ideas:
            category = curated.get('category', 'Other')
            curated_text = f"{curated.get('title', '')} {curated.get('description', '')} {category} {' '.join(curated.get('technologies', []))}"
            curated_normalized = normalize_text(curated_text)
            curated_embedding = model.encode([curated_normalized])[0]
            
            # Calculate max similarity across all query variations
            max_similarity = 0
            for q_emb in all_query_embeddings:
                similarity = float(np.dot(q_emb, curated_embedding) / 
                                   (np.linalg.norm(q_emb) * np.linalg.norm(curated_embedding)))
                max_similarity = max(max_similarity, similarity)
            
            # Fuzzy keyword matching
            search_query = extracted_topic if extracted_topic else normalized_query
            fuzzy_score = fuzz.partial_ratio(search_query.lower(), curated_normalized.lower())
            
            # Check for keyword match in text OR category match
            keyword_match = search_query.lower() in curated_normalized.lower()
            category_match = search_query.upper().replace(' ', '') in category.upper().replace('+', '').replace(' ', '')
            
            # Boost score if fuzzy match is high
            if fuzzy_score > 70:
                max_similarity = max(max_similarity, fuzzy_score / 100)
            
            # Include if similarity > 0.2 OR keyword match OR category match OR high fuzzy score
            if max_similarity > 0.2 or keyword_match or category_match or fuzzy_score > 60:
                matching_ideas.append({
                    "id": curated.get('id', str(uuid.uuid4())),
                    "title": curated.get('title', ''),
                    "description": curated.get('description', ''),
                    "difficulty": curated.get('difficulty', 'Medium'),
                    "technologies": curated.get('technologies', []),
                    "category": category,
                    "isCurated": True,
                    "similarity": round(max_similarity, 2),
                    "fuzzy_score": fuzzy_score
                })
        
        # Sort by similarity (highest first)
        matching_ideas.sort(key=lambda x: (x.get('similarity', 0), x.get('fuzzy_score', 0)), reverse=True)
        
        # Remove duplicates by title
        seen_titles = set()
        unique_ideas = []
        for idea in matching_ideas:
            if idea['title'] not in seen_titles:
                seen_titles.add(idea['title'])
                unique_ideas.append(idea)
        matching_ideas = unique_ideas
        
        # If no matches found, try fuzzy matching with available topics
        if len(matching_ideas) == 0:
            # Try to find similar topics first
            topic_matches = fuzzy_match_topic(search_query, all_topics, threshold=50)
            
            # If still no matches, but we have curated ideas, return random ones as "Featured"
            if curated_ideas:
                import random
                random.shuffle(curated_ideas)
                featured = []
                for idea in curated_ideas[:3]:
                    featured.append({
                        "id": idea.get('id', str(uuid.uuid4())),
                        "title": idea.get('title', ''),
                        "description": idea.get('description', ''),
                        "difficulty": idea.get('difficulty', 'Medium'),
                        "technologies": idea.get('technologies', []),
                        "category": idea.get('category', 'Featured'),
                        "isCurated": True,
                        "similarity": 0.1,
                        "fuzzy_score": 0
                    })
                
                return jsonify({
                    "status": "success",
                    "type": "suggestions_fallback",
                    "message": f"🔍 I couldn't find exact matches for '{raw_query}', but here are some **Strategic Topics** recommended by the faculty:",
                    "ideas": featured,
                    "understood_as": normalized_query,
                    "ai_name": "Hormuud AI"
                })

            if topic_matches:
                suggestions = ", ".join([t[0] for t in topic_matches[:3]])
                return jsonify({
                    "status": "success",
                    "type": "suggestion",
                    "message": f"🔍 I couldn't find exact matches for '{raw_query}'.\n\n💡 **Did you mean:** {suggestions}?\n\n📝 Try one of these topics or ask differently!",
                    "ideas": [],
                    "understood_as": normalized_query,
                    "similar_topics": [t[0] for t in topic_matches[:3]]
                })
            
            return jsonify({
                "status": "success",
                "type": "no_match",
                "message": f"🔍 I couldn't find projects matching '{raw_query}'.\n\nI understood it as: \"{normalized_query}\"\n\n💡 **Try searching for:**\n{topic_suggestions}\n\n📝 Or describe your interest differently!",
                "ideas": [],
                "understood_as": normalized_query
            })
        
        # Return top 4 matches with success message
        return jsonify({
            "status": "success",
            "type": "results",
            "message": f"✅ Found {len(matching_ideas)} project(s) matching your interest:",
            "ideas": matching_ideas[:4],
            "total_matches": len(matching_ideas),
            "understood_as": normalized_query,
            "search_topic": extracted_topic if extracted_topic else normalized_query
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/ai/nlp-test', methods=['POST'])
def test_nlp_understanding():
    """
    Test endpoint to see how the NLP pipeline processes text.
    Useful for debugging and understanding how the AI interprets user input.
    """
    data = request.get_json()
    if not data or 'text' not in data:
        return jsonify({"error": "text is required"}), 400
    
    try:
        raw_text = data['text']
        
        # Run through advanced NLP pipeline
        normalized = normalize_text(raw_text)
        
        # Conversational intent detection (new!)
        conv_intent, conv_score = detect_conversational_intent(raw_text)
        
        # Legacy intent detection
        intent, topic = extract_intent_and_topic(raw_text)
        synonyms = expand_synonyms(topic if topic else normalized)
        
        # Check for typo corrections
        typo_corrected = correct_typos(raw_text.lower())
        somali_translated = translate_somali(raw_text.lower())
        
        # Get sample response
        sample_response = ""
        if conv_intent and conv_score >= 0.7:
            sample_response = get_conversational_response(conv_intent, raw_text)
        
        return jsonify({
            "status": "success",
            "original": raw_text,
            "normalized": normalized,
            "conversational_intent": conv_intent,
            "conversational_confidence": round(conv_score, 2) if conv_score else 0,
            "legacy_intent": intent,
            "extracted_topic": topic,
            "synonym_expansions": synonyms,
            "typo_correction": typo_corrected,
            "somali_translation": somali_translated,
            "sample_response": sample_response,
            "would_respond_conversationally": conv_intent is not None and conv_score >= 0.7,
            "pipeline_steps": [
                f"1. Original: '{raw_text}'",
                f"2. Conversational check: intent='{conv_intent}', confidence={round(conv_score, 2) if conv_score else 0}",
                f"3. Somali translated: '{somali_translated}'",
                f"4. Typo corrected: '{typo_corrected}'",
                f"5. Fully normalized: '{normalized}'",
                f"6. Final intent: '{conv_intent if conv_intent and conv_score >= 0.7 else intent}'",
                f"7. Topic extracted: '{topic}'",
            ],
            "ai_name": AI_NAME
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/ai/chat', methods=['POST'])
def smart_chat():
    """
    Universal smart chat endpoint - handles ANY user input intelligently.
    This is the main entry point for conversational AI.
    """
    data = request.get_json()
    if not data or 'message' not in data:
        return jsonify({"error": "message is required"}), 400
    
    try:
        message = data['message'].strip()
        context = data.get('context', '')
        
        # First try conversational patterns
        conv_intent, conv_score = detect_conversational_intent(message)
        
        if conv_intent and conv_score >= 0.6:
            response = get_conversational_response(conv_intent, message)
            return jsonify({
                "status": "success",
                "response": response,
                "intent": conv_intent,
                "confidence": round(conv_score, 2),
                "ai_name": AI_NAME
            })
        
        # For unclear queries, use Gemini
        gemini_response = call_gemini_api(message, context)
        if gemini_response:
            return jsonify({
                "status": "success",
                "response": gemini_response,
                "intent": "ai_generated",
                "ai_name": AI_NAME,
                "powered_by": "gemini"
            })
        
        # Fallback
        return jsonify({
            "status": "success",
            "response": f"I heard you say: \"{message}\"\n\nI'm here to help you find graduation project ideas! Try telling me a topic you're interested in, like 'AI', 'web development', or 'healthcare'.",
            "intent": "fallback",
            "ai_name": AI_NAME
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/ai/capabilities', methods=['GET'])
def get_capabilities():
    """Return information about the AI's language understanding capabilities."""
    return jsonify({
        "status": "success",
        "ai_name": AI_NAME,
        "version": "3.0.0",
        "capabilities": {
            "conversational_ai": {
                "description": "Natural conversation understanding with personality",
                "supported_intents": list(CONVERSATIONAL_PATTERNS.keys()),
                "examples": [
                    "how are you? → friendly response",
                    "thank you → appreciation response", 
                    "tell me a joke → tech humor"
                ]
            },
            "typo_correction": {
                "description": "Automatically corrects common typos",
                "examples": ["machien lerning → machine learning", "artifical inteligence → artificial intelligence"]
            },
            "somali_support": {
                "description": "Understands common Somali words related to projects",
                "examples": ["mashruuc → project", "caafimaad → health", "waxbarasho → education", "iska waran → hello"]
            },
            "synonym_expansion": {
                "description": "Expands queries to include related terms",
                "topics": list(TOPIC_SYNONYMS.keys())
            },
            "gemini_integration": {
                "description": "Falls back to Gemini AI for complex queries",
                "status": "enabled"
            },
            "fuzzy_matching": {
                "description": "Finds matches even with spelling variations",
                "threshold": "70% similarity"
            }
        },
        "personality": AI_PERSONALITY,
        "supported_languages": ["English", "Somali (conversational)"]
    })

if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

    port = int(os.environ.get('PORT', 5001))
    print(f"")
    print(f"╔══════════════════════════════════════════════════════════════╗")
    print(f"║  🤖 Hormuud AI - Intelligent Academic Assistant v4.0         ║")
    print(f"╚══════════════════════════════════════════════════════════════╝")
    print(f"")
    print(f"🌐 Server starting on port {port}")
    print(f"")
    print(f"📚 API Endpoints:")
    print(f"   POST /api/ai/generate-ideas-smart - Smart project idea generation")
    print(f"   POST /api/ai/chat                 - Universal smart chat")
    print(f"   POST /api/ai/nlp-test             - Test NLP understanding")
    print(f"   GET  /api/ai/capabilities         - View AI capabilities")
    print(f"")
    print(f"🧠 Intelligence Features:")
    print(f"   ✓ Conversational AI with personality")
    print(f"   ✓ 'How are you?' understanding")
    print(f"   ✓ Typo correction (machien → machine)")
    print(f"   ✓ Somali language support")
    print(f"   ✓ Gemini API fallback for complex queries")
    print(f"   ✓ Semantic intent detection")
    print(f"   ✓ Fuzzy matching for flexible search")
    print(f"")
    print(f"💬 Try saying: 'hello', 'how are you', 'help', 'AI projects'")
    print(f"")
    app.run(host='0.0.0.0', port=port, debug=True, use_reloader=False)
