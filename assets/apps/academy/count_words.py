from bs4 import BeautifulSoup
import sys

def count_words(filepath):
    with open(filepath, 'r') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')
        article = soup.find('article')
        if not article:
            return 0
        # remove nav, source-note etc
        for tag in article.find_all(['nav', '.source-note', '.image-slot']):
            tag.decompose()
        # also remove specific divs by class
        for div in article.find_all('div', class_='source-note'):
            div.decompose()
        for div in article.find_all('div', class_='breadcrumb'):
            div.decompose()
        text = article.get_text(separator=' ')
        return len(text.split())

print("File 10 words:", count_words(sys.argv[1]))
print("File 11 words:", count_words(sys.argv[2]))
