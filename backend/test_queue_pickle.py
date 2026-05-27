import multiprocessing
import concurrent.futures

def worker(q):
    q.put("hello")
    return "done"

if __name__ == '__main__':
    manager = multiprocessing.Manager()
    q = manager.Queue()
    with concurrent.futures.ProcessPoolExecutor(max_workers=2) as executor:
        f = executor.submit(worker, q)
        print(f.result())
        print(q.get())
