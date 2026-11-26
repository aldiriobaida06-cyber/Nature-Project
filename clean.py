import sqlite3
for db_name in ['database.db', 'wallpaper.db']:
    try:
        conn = sqlite3.connect(db_name)
        conn.execute("DELETE FROM wallpaper WHERE image_url NOT LIKE '/static/uploads/%'")
        conn.commit()
        conn.close()
        print("Database cleared successfully")
    except Exception:
        pass

if __name__ == "__main__":
       database = sqlite3.connect('database.db')