class EVotingSystem:
    def __init__(self, voter_id: str, age: int):
        self.__voter_id = voter_id
        self.__age = age
        self.__has_voted = False

        self.__candidate_votes = {"Ahmed": 0, "Jamal": 0, "Ali": 0}


    def __verify_voter_eligibility(self) -> bool:
        if self.__age >= 18:
            return True
        else:
            return False


    def __encrypt_and_save_vote(self, candidate_name: str):
        if candidate_name in self.__candidate_votes:
            self.__candidate_votes[candidate_name] += 1
            print(self.__candidate_votes)
            return True
        else:
            print("Candidate not found in the list")
            return False


    def vote_for(self, candidate_name: str):
        if self.__has_voted:
            print("Sorry, you have already voted ! You cannot vote twice")
            return
        if not self.__verify_voter_eligibility():
            print("Sorry, you are not eligible to vote due to the legal age requirement")
            return
        voted_successfully = self.__encrypt_and_save_vote(candidate_name)
        if voted_successfully:
            self.__has_voted = True
            print("You voice has been recorded successfully !")

    @property
    def candidates_list(self):
        return list(self.__candidate_votes.keys())

voter1 = EVotingSystem(voter_id="12345", age=20)
voter1.vote_for("Jamal")
voter1.vote_for("Ahmed")


